'use client';
import {useEffect,useState} from 'react';
import {getSupabaseBrowserClient} from '@/src/auth/supabase-browser';
type Props={onTokenChange:(token:string)=>void};
export default function AuthBar({onTokenChange}:Props){
 const [email,setEmail]=useState(''),[ready,setReady]=useState(false);
 useEffect(()=>{const client=getSupabaseBrowserClient();if(!client){setReady(true);return;}let active=true;
 client.auth.getUser().then(({data})=>{if(active){setEmail(data.user?.email??'');setReady(true);onTokenChange('');}});
 const {data}=client.auth.onAuthStateChange((_event,session)=>{if(active){setEmail(session?.user.email??'');onTokenChange('');}});
 return()=>{active=false;data.subscription.unsubscribe();};
 },[onTokenChange]);
 async function signOut(){const client=getSupabaseBrowserClient();if(client)await client.auth.signOut();window.location.assign('/login');}
 if(!ready)return <span className="auth">Checking session…</span>;
 return <div className="auth">{email?<><a href="/workspace">Workspace</a><span title={email}>{email}</span><button onClick={signOut}>Sign out</button></>:<><a href="/login">Sign in</a><a href="/signup">Create account</a></>}<style jsx>{`.auth{display:flex;align-items:center;gap:10px;color:#9db0c0;font-size:11px}.auth a{color:#74dfbd;text-decoration:none;font-weight:700}.auth button{background:transparent;border:1px solid #2b4557;border-radius:8px;padding:8px 10px;color:#cbd9e2;font-size:11px}.auth span{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(max-width:600px){.auth{flex-wrap:wrap}}`}</style></div>;
}
