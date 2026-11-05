import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '../../../src/auth/supabase-server';
import {transitionLead} from '../../../src/agents/crm-pipeline';
import {recordRevenueEvent} from '../../../src/agents/revenue-store';

export async function GET(){
 const s=await createSupabaseServerClient();const {data:{user},error}=await s.auth.getUser();
 if(error||!user)return NextResponse.json({error:'Sign in to view your CRM.'},{status:401});
 const {data:membership}=await s.from('company_memberships').select('company_id').eq('user_id',user.id).eq('status','active').limit(1).maybeSingle();
 if(!membership)return NextResponse.json({error:'Company membership required.'},{status:403});
 const {data,error:queryError}=await s.from('leads').select('id,status,score,score_label,created_at,updated_at,businesses(name,city,country,website,email)').eq('company_id',membership.company_id).order('created_at',{ascending:false});
 if(queryError)return NextResponse.json({error:'Unable to load company leads.'},{status:500});
 const leads=(data??[]).map((row:any)=>({lead:{id:row.id,status:row.status,score:row.score,scoreLabel:row.score_label,createdAt:row.created_at,updatedAt:row.updated_at},business:Array.isArray(row.businesses)?row.businesses[0]:row.businesses}));
 return NextResponse.json({leads});
}
export async function PATCH(request:Request){
 const s=await createSupabaseServerClient();const {data:{user},error}=await s.auth.getUser();
 if(error||!user)return NextResponse.json({error:'Sign in to update your CRM.'},{status:401});
 const body=await request.json().catch(()=>({}));const leadId=typeof body.leadId==='string'?body.leadId:'';const to=typeof body.status==='string'?body.status:null;
 if(!leadId||!to)return NextResponse.json({error:'leadId and status are required.'},{status:400});
 const {data:membership}=await s.from('company_memberships').select('company_id').eq('user_id',user.id).eq('status','active').limit(1).maybeSingle();
 if(!membership)return NextResponse.json({error:'Company membership required.'},{status:403});
 const {data:row,error:loadError}=await s.from('leads').select('id,company_id,account_id,business_id,status,score,score_label,created_at,updated_at').eq('id',leadId).eq('company_id',membership.company_id).maybeSingle();
 if(loadError||!row)return NextResponse.json({error:'Lead not found.'},{status:404});
 try{
  const current={id:row.id,accountId:row.account_id,businessId:row.business_id,status:row.status,score:row.score,scoreLabel:row.score_label,createdAt:row.created_at,updatedAt:row.updated_at};
  const next=transitionLead(current,to as any);
  const {error:updateError}=await s.from('leads').update({status:next.status,updated_at:next.updatedAt}).eq('id',leadId).eq('company_id',membership.company_id).eq('status',current.status);
  if(updateError)return NextResponse.json({error:'Unable to update lead status.'},{status:409});
  if(current.status!=='CUSTOMER'&&next.status==='CUSTOMER'){try{await recordRevenueEvent(user.id,{leadId,agentId:'crm',event:'won',value:0,currency:'USD',occurredAt:next.updatedAt})}catch{/* CRM state remains valid; this event is attribution, not verified payment. */}}
  return NextResponse.json({lead:next});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Invalid transition'},{status:409})}
}
