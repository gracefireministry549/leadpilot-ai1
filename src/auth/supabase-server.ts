import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { AuthenticatedUser } from './server-auth';

export async function createSupabaseServerClient() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key) throw new Error('Supabase environment variables are missing.');
  const cookieStore=cookies();
  return createServerClient(url,key,{cookies:{
    getAll(){return cookieStore.getAll();},
    setAll(values){try{values.forEach(({name,value,options})=>cookieStore.set(name,value,options));}catch{/* Server Components cannot write cookies; middleware refreshes. */}}
  }});
}
export async function getSupabaseAuthenticatedUser(_request?:Request):Promise<AuthenticatedUser|null>{
  try{const supabase=await createSupabaseServerClient();const {data,error}=await supabase.auth.getUser();if(error||!data.user)return null;return{id:data.user.id,email:data.user.email??undefined};}catch{return null;}
}
