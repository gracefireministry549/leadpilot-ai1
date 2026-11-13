export const dynamic = 'force-dynamic';

import {redirect} from 'next/navigation';
import {createSupabaseServerClient} from '../../../src/auth/supabase-server';
import {createCompany} from '../actions';
export default async function Setup(props: { searchParams: Promise<{error?:string}> }) {
  const searchParams = await props.searchParams;
 const supabase=await createSupabaseServerClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login');
 const {data}=await supabase.from('companies').select('id').limit(1);if(data?.length)redirect('/workspace');
 return <main className="setup"><form action={createCompany}><p className="eyebrow">LEADPILOT AI · FIRST-TIME SETUP</p><h1>Let’s set up your company.</h1><p>Your workspace starts empty. Your six AI employees will be created after you name your company.</p>{searchParams.error&&<div className="error">{searchParams.error}</div>}<label>Company or business name<input name="name" minLength={2} maxLength={120} placeholder="e.g. Victory Digital" required/></label><button>Create company workspace</button><small>You'll be the initial owner. You can add team members later.</small></form><style>{`body{margin:0;background:var(--ws-bg);color:#eaf2f8;font-family:system-ui}.setup{min-height:100vh;display:grid;place-items:center;padding:18px}.setup form{width:min(100%,500px);display:grid;gap:16px;padding:30px;border:1px solid var(--ws-border);border-radius:18px;background:var(--ws-panel)}.eyebrow{font-size:10px;letter-spacing:.15em;color:var(--ws-accent);font-weight:800}.setup h1{font-size:38px;line-height:1.05;margin:0}.setup p{color:#9db0c0;line-height:1.5}.setup label{display:grid;gap:8px;font-size:13px}.setup input{padding:14px;border:1px solid var(--ws-border);border-radius:9px;background:var(--ws-bg);color:white}.setup button{padding:14px;border:0;border-radius:9px;background:var(--ws-accent);font-weight:800}.setup small{color:#8da2b3}.error{color:#ffb6bf}`}</style></main>;
}
