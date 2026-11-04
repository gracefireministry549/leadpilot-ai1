import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '../../../../src/auth/supabase-server';
export async function POST(request:Request){
 const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:'Authentication required.'},{status:401});
 const body=await request.json().catch(()=>({}));const action_type=typeof body.actionType==='string'?body.actionType.trim():'';const title=typeof body.title==='string'?body.title.trim():'';const summary=typeof body.summary==='string'?body.summary.trim():'';const payload=body.payload&&typeof body.payload==='object'&&!Array.isArray(body.payload)?body.payload:{};
 if(!action_type||!title||!summary)return NextResponse.json({error:'Action type, title and summary are required.'},{status:400});
 const {data:m}=await s.from('company_memberships').select('company_id').eq('user_id',user.id).eq('status','active').limit(1).maybeSingle();if(!m)return NextResponse.json({error:'Company membership required.'},{status:403});
 const {data,error}=await s.from('approval_requests').insert({company_id:m.company_id,requested_by:user.id,action_type,title,summary,payload,status:'pending'}).select('id,status').single();
 if(error||!data)return NextResponse.json({error:'Could not create approval request.'},{status:500});
 return NextResponse.json(data,{status:201});
}
