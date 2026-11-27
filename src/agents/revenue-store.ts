import { createClient } from '@supabase/supabase-js';
import type { RevenueEvent } from './revenue';
function db(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('Supabase server credentials are not configured.');return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}})}
export async function recordRevenueEvent(userId:string,event:RevenueEvent){const {data,error}=await db().from('revenue_events').insert({user_id:userId,lead_id:event.leadId??null,agent_id:event.agentId??null,event:event.event,value:event.value??0,currency:event.currency??'USD',occurred_at:event.occurredAt}).select().single();if(error)throw error;return data}
export async function getRevenueEvents(userId:string){const {data,error}=await db().from('revenue_events').select('*').eq('user_id',userId).order('occurred_at',{ascending:false});if(error)throw error;return data??[]}
