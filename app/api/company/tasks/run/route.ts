import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '../../../../../src/auth/supabase-server';
import {runAgent} from '../../../../../src/agents/runtime';

const mapping:Record<string,string>={company_manager:'general-manager',opportunity_researcher:'opportunity-finder',lead_researcher:'lead-finder',website_builder:'website-brand',sales_analyst:'general-manager',finance_assistant:'general-manager'};
export async function POST(request:Request){
 const s=await createSupabaseServerClient();const {data:{user},error:authError}=await s.auth.getUser();if(authError||!user)return NextResponse.json({error:'Authentication required.'},{status:401});
 const body=await request.json().catch(()=>({}));const title=typeof body.title==='string'?body.title.trim():'';const instructions=typeof body.instructions==='string'?body.instructions.trim():'';const employeeRole=typeof body.employeeRole==='string'?body.employeeRole:'';
 if(title.length<3||title.length>160)return NextResponse.json({error:'Task title must be 3–160 characters.'},{status:400});
 const {data:membership}=await s.from('company_memberships').select('company_id').eq('user_id',user.id).eq('status','active').limit(1).maybeSingle();if(!membership)return NextResponse.json({error:'Company membership required.'},{status:403});
 let employee:any=null;if(employeeRole){const {data}=await s.from('agent_employees').select('id,role_key,display_name,status').eq('role_key',employeeRole).eq('company_id',membership.company_id).maybeSingle();employee=data;if(!employee)return NextResponse.json({error:'Employee not found in this company.'},{status:404});if(employee.status!=='active')return NextResponse.json({error:'This AI employee is paused.'},{status:409});}
 const role=employee?.role_key??'company_manager',agent=mapping[role]??'general-manager';
 const {data:task,error:insertError}=await s.from('company_tasks').insert({company_id:membership.company_id,employee_id:employee?.id??null,created_by:user.id,title,instructions,status:'running',started_at:new Date().toISOString()}).select('id').single();
 if(insertError||!task)return NextResponse.json({error:'Could not create task.'},{status:500});
 try{
  const result=await runAgent({accountId:membership.company_id,userId:user.id},{agent:agent as any,query:instructions?title+'\n\n'+instructions:title,limit:20});
  const payload='body' in (result as any)?(result as any).body:result;
  const {error:updateError}=await s.from('company_tasks').update({status:'succeeded',result:payload,completed_at:new Date().toISOString()}).eq('id',task.id).eq('company_id',membership.company_id);
  await s.from('research_reports').insert({company_id:membership.company_id,created_by:user.id,agent_key:agent,title,summary:typeof (payload as any)?.message==='string'?(payload as any).message:'Agent task completed. Review the structured findings and source evidence.',findings:Array.isArray((payload as any)?.results)?(payload as any).results:[],evidence:Array.isArray((payload as any)?.evidence)?(payload as any).evidence:[],confidence:null});
  if(updateError)return NextResponse.json({error:'Task ran but its result could not be saved.'},{status:500});
  return NextResponse.json({taskId:task.id,agent,result:payload},{status:200});
 }catch(error){
  const message=error instanceof Error?error.message:'Agent execution failed.';
  await s.from('company_tasks').update({status:'failed',error:message,completed_at:new Date().toISOString()}).eq('id',task.id).eq('company_id',membership.company_id);
  return NextResponse.json({error:message,taskId:task.id},{status:500});
 }
}
