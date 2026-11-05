export interface AuthenticatedUser {id:string;email?:string;}

/** Resolve identity only from the validated Supabase SSR cookie session. */
export async function requireAuthenticatedUser(request?:Request):Promise<AuthenticatedUser|null>{
 const {getSupabaseAuthenticatedUser}=await import('./supabase-server');
 return getSupabaseAuthenticatedUser(request);
}
