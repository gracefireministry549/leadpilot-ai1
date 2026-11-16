import {headers} from 'next/headers';

/** Public origin of the running site, so email links never point at localhost in production. */
export async function siteUrl():Promise<string>{
  const h=await headers();
  const host=h.get('x-forwarded-host')??h.get('host');
  if(host){
    const proto=h.get('x-forwarded-proto')??(/^(localhost|127\.)/.test(host)?'http':'https');
    return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL??'http://localhost:3000';
}
