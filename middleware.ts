import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';
export async function middleware(request:NextRequest){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)return NextResponse.next({request});
 let response=NextResponse.next({request});
 const supabase=createServerClient(url,key,{cookies:{
  getAll(){return request.cookies.getAll();},
  setAll(values,headers){values.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});values.forEach(({name,value,options})=>response.cookies.set(name,value,options));Object.entries(headers??{}).forEach(([k,v])=>response.headers.set(k,v));}
 }});
 const {data}=await supabase.auth.getUser();
 const path=request.nextUrl.pathname;
 if((path.startsWith('/workspace')||path.startsWith('/settings')||path.startsWith('/api/company')||path.startsWith('/api/approvals'))&&!data.user){
  const target=request.nextUrl.clone();target.pathname='/login';target.searchParams.set('next',path);return NextResponse.redirect(target);
 }
 response.headers.set('Cache-Control','private, no-store');return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']};
