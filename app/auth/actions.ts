'use server';
import {redirect} from 'next/navigation';
import {createSupabaseServerClient} from '../../src/auth/supabase-server';
function safeNext(v:FormDataEntryValue|null){const p=typeof v==='string'?v:'';return p.startsWith('/')&&!p.startsWith('//')?p:'/workspace';}
export async function signIn(form:FormData){
 const email=String(form.get('email')??'').trim().toLowerCase(),password=String(form.get('password')??'');
 if(!email||!password)redirect('/login?error=Enter%20email%20and%20password');
 const supabase=await createSupabaseServerClient();const {error}=await supabase.auth.signInWithPassword({email,password});
 if(error)redirect('/login?error=Unable%20to%20sign%20in.%20Verify%20your%20email%20and%20check%20your%20details.');
 redirect(safeNext(form.get('next')));
}
export async function signUp(form:FormData){
 const displayName=String(form.get('displayName')??'').trim(),email=String(form.get('email')??'').trim().toLowerCase(),password=String(form.get('password')??'');
 if(form.get('terms')!=='on'||displayName.length<2||password.length<10)redirect('/signup?error=Check%20your%20details%20and%20accept%20the%20terms');
 const supabase=await createSupabaseServerClient();
 const {error}=await supabase.auth.signUp({email,password,options:{data:{display_name:displayName},emailRedirectTo:`${process.env.NEXT_PUBLIC_SITE_URL??'http://localhost:3000'}/auth/callback`}});
 if(error)redirect('/signup?error=Unable%20to%20create%20account.%20Try%20again.');
 redirect('/login?error=Check%20your%20email%20to%20verify%20your%20account.');
}
export async function signOut(){const supabase=await createSupabaseServerClient();await supabase.auth.signOut();redirect('/login');}
