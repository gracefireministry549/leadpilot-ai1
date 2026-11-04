'use server';
import {redirect} from 'next/navigation';
import {createSupabaseServerClient} from '../../src/auth/supabase-server';

const defaultEmployees=[
 ['company_manager','Company Manager','Coordinates priorities, delegates tasks and summarises company progress.'],
 ['opportunity_researcher','Opportunity Researcher','Finds market gaps, demand signals and public opportunities.'],
 ['lead_researcher','Lead Researcher','Finds and verifies potential customers with source evidence.'],
 ['website_builder','Website Builder','Prepares website structures and brand assets for owner review.'],
 ['sales_analyst','Sales Analyst','Analyses pipeline, conversions and sales performance.'],
 ['finance_assistant','Finance Assistant','Organises expense records and evidence-backed revenue.']
] as const;

async function context(){
 const supabase=await createSupabaseServerClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)redirect('/login');
 const {data:membership}=await supabase.from('company_memberships').select('company_id,role').eq('user_id',user.id).eq('status','active').order('created_at',{ascending:true}).limit(1).maybeSingle();
 if(!membership)redirect('/workspace/setup');
 return {supabase,user,companyId:membership.company_id,role:membership.role};
}

export async function signOut(){
 const supabase=await createSupabaseServerClient();await supabase.auth.signOut();redirect('/login');
}
export async function createCompany(form:FormData){
 const supabase=await createSupabaseServerClient();
 const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login');
 const name=String(form.get('name')??'').trim();
 if(name.length<2||name.length>120)redirect('/workspace/setup?error=Company%20name%20must%20be%202%20to%20120%20characters');
 const {data:company,error}=await supabase.from('companies').insert({name,created_by:user.id}).select('id').single();
 if(error||!company)redirect('/workspace/setup?error=Could%20not%20create%20company');
 const {error:memberError}=await supabase.from('company_memberships').insert({company_id:company.id,user_id:user.id,role:'owner',status:'active'});
 if(memberError)redirect('/workspace/setup?error=Could%20not%20create%20company%20ownership');
 const {error:agentError}=await supabase.from('agent_employees').insert(defaultEmployees.map(([role_key,display_name,description])=>({company_id:company.id,role_key,display_name,description,status:'active'})));
 if(agentError)redirect('/workspace?warning=Company%20created%20but%20AI%20employee%20setup%20needs%20attention');
 redirect('/workspace');
}
export async function setEmployeeStatus(form:FormData){
 const {supabase,companyId}=await context();
 const id=String(form.get('id')??''),status=String(form.get('status')??'');
 if(!id||!['active','paused'].includes(status))return;
 await supabase.from('agent_employees').update({status}).eq('id',id).eq('company_id',companyId);
 redirect('/workspace/agents');
}
export async function createTask(form:FormData){
 const {supabase,user,companyId}=await context();
 const title=String(form.get('title')??'').trim(),instructions=String(form.get('instructions')??'').trim(),employeeId=String(form.get('employeeId')??'');
 if(title.length<3||title.length>160)redirect('/workspace/agents?error=Task%20title%20must%20be%203%20to%20160%20characters');
 await supabase.from('company_tasks').insert({company_id:companyId,created_by:user.id,employee_id:employeeId||null,title,instructions,status:'queued'});
 redirect('/workspace/agents');
}
export async function decideApproval(form:FormData){
 const {supabase,user,companyId,role}=await context();
 if(!['owner','admin'].includes(role))redirect('/workspace/approvals?error=Only%20owners%20and%20admins%20can%20decide');
 const id=String(form.get('id')??''),decision=String(form.get('decision')??'');
 if(!id||!['approved','rejected'].includes(decision))return;
 const {data:row}=await supabase.from('approval_requests').update({status:decision,decided_by:user.id,decided_at:new Date().toISOString()}).eq('id',id).eq('company_id',companyId).eq('status','pending').select('id').maybeSingle();
 if(!row)redirect('/workspace/approvals?error=This%20request%20is%20no%20longer%20pending');
 redirect('/workspace/approvals');
}
export async function addFinanceEntry(form:FormData){
 const {supabase,user,companyId}=await context();
 const entry_type=String(form.get('entry_type')??''),description=String(form.get('description')??'').trim(),amount=Number(form.get('amount')??0),currency=String(form.get('currency')??'NGN').toUpperCase();
 if(!['revenue','expense'].includes(entry_type)||!description||!Number.isFinite(amount)||amount<=0||amount>100000000000||!/^[A-Z]{3}$/.test(currency))redirect('/workspace/finance?error=Enter%20a%20valid%20entry');
 await supabase.from('financial_entries').insert({company_id:companyId,created_by:user.id,entry_type,status:'unverified',amount_minor:Math.round(amount*100),currency,description});
 redirect('/workspace/finance');
}

export async function createApprovalRequest(form:FormData){
 const {supabase,user,companyId}=await context();
 const actionType=String(form.get('action_type')??'').trim(),title=String(form.get('title')??'').trim(),summary=String(form.get('summary')??'').trim();
 if(!actionType||!title||!summary)redirect('/workspace/approvals?error=Complete%20all%20approval%20request%20fields');
 await supabase.from('approval_requests').insert({company_id:companyId,requested_by:user.id,action_type:actionType,title,summary,payload:{requestedFrom:'workspace'},status:'pending'});
 redirect('/workspace/approvals');
}
export async function verifyFinanceEntry(form:FormData){
 const {supabase,companyId,role,user}=await context();
 if(!['owner','admin'].includes(role))redirect('/workspace/finance?error=Only%20owners%20and%20admins%20can%20verify%20entries');
 const id=String(form.get('id')??'');if(!id)return;
 await supabase.from('financial_entries').update({status:'verified'}).eq('id',id).eq('company_id',companyId).eq('status','unverified');
 await supabase.from('activity_events').insert({company_id:companyId,actor_id:user.id,event_type:'finance_entry_verified',summary:'A financial entry was marked verified.'});
 redirect('/workspace/finance');
}
export async function addLead(form:FormData){
 const {supabase,user,companyId}=await context();
 const name=String(form.get('name')??'').trim(),website=String(form.get('website')??'').trim(),city=String(form.get('city')??'').trim(),country=String(form.get('country')??'').trim(),email=String(form.get('email')??'').trim();
 if(name.length<2)redirect('/workspace/crm?error=Business%20name%20is%20required');
 const {data:business,error}=await supabase.from('businesses').insert({company_id:companyId,name,website:website||null,city:city||null,country:country||null,email:email||null,source:'manual'}).select('id').single();
 if(error||!business)redirect('/workspace/crm?error=Could%20not%20save%20business');
 await supabase.from('leads').insert({company_id:companyId,business_id:business.id,created_by:user.id,status:'NEW',score:0,score_label:'LOW'});
 redirect('/workspace/crm');
}

export async function requestAccountDeletion(){
 const supabase=await createSupabaseServerClient();
 const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login');
 const {data:existing}=await supabase.from('account_deletion_requests').select('id').eq('user_id',user.id).eq('status','requested').maybeSingle();
 if(!existing)await supabase.from('account_deletion_requests').insert({user_id:user.id,status:'requested'});
 redirect('/settings/account?requested=1');
}
