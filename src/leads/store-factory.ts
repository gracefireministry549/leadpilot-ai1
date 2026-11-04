import {SupabaseLeadStore} from './supabase-store';
import {MemoryLeadStore,type LeadStore} from './store';
let memoryStore:MemoryLeadStore|undefined;
export function configuredLeadStore(companyId?:string):LeadStore{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),serviceRoleKey=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
 if(url&&serviceRoleKey&&companyId)return new SupabaseLeadStore({url,serviceRoleKey,companyId});
 memoryStore??=new MemoryLeadStore();return memoryStore;
}
