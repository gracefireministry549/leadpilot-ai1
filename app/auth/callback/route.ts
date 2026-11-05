import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '../../../src/auth/supabase-server';
export async function GET(request:Request){
 const url=new URL(request.url),code=url.searchParams.get('code'),next=url.searchParams.get('next');
 const dest=next&&next.startsWith('/')&&!next.startsWith('//')?next:'/workspace';
 if(code){const supabase=await createSupabaseServerClient();const {error}=await supabase.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(new URL(dest,url.origin));}
 return NextResponse.redirect(new URL('/login?error=Verification%20could%20not%20be%20completed',url.origin));
}
