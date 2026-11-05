import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '../../../../src/auth/supabase-server';

const employees=[
 {role_key:'company_manager',display_name:'Company Manager',description:'Coordinates company priorities and agent work.'},
 {role_key:'opportunity_researcher',display_name:'Opportunity Researcher',description:'Finds market gaps and demand signals.'},
 {role_key:'lead_researcher',display_name:'Lead Researcher',description:'Finds and verifies potential customers.'},
 {role_key:'website_builder',display_name:'Website Builder',description:'Plans and creates approval-ready website assets.'},
 {role_key:'sales_analyst',display_name:'Sales Analyst',description:'Analyses pipeline and sales performance.'},
 {role_key:'finance_assistant',display_name:'Finance Assistant',description:'Organises expenses and evidence-backed revenue.'}
];

export async function POST(request:Request){
 const supabase=await createSupabaseServerClient();
 const {data:{user},error:authError}=await supabase.auth.getUser();
 if(authError||!user)return NextResponse.json({error:'Authentication required.'},{status:401});
 const body=await request.json().catch(()=>({}));
 const name=typeof body.name==='string'?body.name.trim():'';
 if(name.length<2||name.length>120)return NextResponse.json({error:'Company name must be 2–120 characters.'},{status:400});
 const {data:company,error}=await supabase.from('companies').insert({name,created_by:user.id}).select('id,name').single();
 if(error||!company)return NextResponse.json({error:'Could not create company.'},{status:400});
 const {error:membershipError}=await supabase.from('company_memberships').insert({company_id:company.id,user_id:user.id,role:'owner',status:'active'});
 if(membershipError){await supabase.from('companies').delete().eq('id',company.id);return NextResponse.json({error:'Could not establish company ownership.'},{status:500});}
 const {error:employeeError}=await supabase.from('agent_employees').insert(employees.map(employee=>({...employee,company_id:company.id})));
 if(employeeError)return NextResponse.json({company,warning:'Company created, but default AI employees need setup.'},{status:201});
 return NextResponse.json({company,employeesCreated:employees.length},{status:201});
}
