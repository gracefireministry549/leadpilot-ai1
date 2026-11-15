import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function db(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('Supabase server credentials are not configured.');return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}})}
function validSignature(raw:string,signature:string,secret:string){const expected=crypto.createHmac('sha512',secret).update(raw).digest('hex');try{return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature));}catch{return false}}

export async function POST(request:Request){
 const contentLength=Number(request.headers.get('content-length')||0);
 if(contentLength>1_000_000)return NextResponse.json({error:'Webhook body is too large.'},{status:413});
 const raw=await request.text();
 if(new TextEncoder().encode(raw).byteLength>1_000_000)return NextResponse.json({error:'Webhook body is too large.'},{status:413});const signature=request.headers.get('x-paystack-signature')||'';const secret=process.env.PAYSTACK_SECRET_KEY||'';
 if(!secret||!signature||!validSignature(raw,signature,secret))return NextResponse.json({error:'Invalid webhook signature.'},{status:401});
 let payload:any;try{payload=JSON.parse(raw)}catch{return NextResponse.json({error:'Invalid JSON.'},{status:400})}
 if(!payload||typeof payload!=='object'||Array.isArray(payload))return NextResponse.json({error:'Invalid webhook payload.'},{status:400});
 if(payload.event!=='charge.success')return NextResponse.json({received:true});
 const data=payload.data||{};const reference=String(data.reference||'');const providerId=String(data.id||'');if(!reference)return NextResponse.json({error:'Missing transaction reference.'},{status:400});
 const supabase=db();
 const {data:existing}=await supabase.from('processed_payment_events').select('id').eq('event_id',`${payload.event}:${reference}`).maybeSingle();
 if(existing)return NextResponse.json({received:true,duplicate:true});
 const metadata=data.metadata||{};const userId=metadata.userId||metadata.user_id||null;const leadId=metadata.leadId||metadata.lead_id||null;const agentId=metadata.agentId||metadata.agent_id||null;
 if(!userId)return NextResponse.json({error:'Payment has no owning user.'},{status:422});
 const amount=Number(data.amount||0);const currency=String(data.currency||'NGN');
 const {error:txError}=await supabase.from('payment_transactions').upsert({user_id:userId,reference,provider_transaction_id:providerId,status:'success',amount,currency,lead_id:leadId,agent_id:agentId,paid_at:data.paid_at||new Date().toISOString(),raw_payload:payload},{onConflict:'reference'});
 if(txError)throw txError;
 const {error:eventError}=await supabase.from('processed_payment_events').insert({event_id:`${payload.event}:${reference}`,provider:'paystack',reference,processed_at:new Date().toISOString()});
 if(eventError && eventError.code!=='23505')throw eventError;
 const {data:alreadyWon}=await supabase.from('revenue_events').select('id').eq('user_id',userId).eq('lead_id',leadId).eq('event','won').eq('value',amount).maybeSingle();
 if(!alreadyWon){const {error:revError}=await supabase.from('revenue_events').insert({user_id:userId,lead_id:leadId,agent_id:agentId,event:'won',value:amount/100,currency,occurred_at:data.paid_at||new Date().toISOString()});if(revError)throw revError;}
 return NextResponse.json({received:true,reference,status:'success'});
}
