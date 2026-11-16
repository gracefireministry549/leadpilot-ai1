'use server';
import {redirect} from 'next/navigation';
import {createSupabaseServerClient} from '../../src/auth/supabase-server';
import {siteUrl} from '../../src/auth/site-url';
function safeNext(v:FormDataEntryValue|null){const p=typeof v==='string'?v:'';return p.startsWith('/')&&!p.startsWith('//')&&!p.includes('\\')&&!/[\\u0000-\\u001f]/.test(p)?p:'/workspace';}
export async function signIn(form:FormData){
 const email=String(form.get('email')??'').trim().toLowerCase(),password=String(form.get('password')??'');
 if(!email||!password)redirect('/login?error=Enter%20email%20and%20password');
 const supabase=await createSupabaseServerClient();const {error}=await supabase.auth.signInWithPassword({email,password});
 if(error){
  if(error.code==='email_not_confirmed')redirect('/login?error='+encodeURIComponent('Your email is not verified yet. Open the verification link we sent, or resend it below.')+'&email='+encodeURIComponent(email));
  redirect('/login?error='+encodeURIComponent('Wrong email or password.')+'&email='+encodeURIComponent(email));
 }
 redirect(safeNext(form.get('next')));
}
export async function signUp(form:FormData){
 const displayName=String(form.get('displayName')??'').trim(),email=String(form.get('email')??'').trim().toLowerCase(),password=String(form.get('password')??'');
 const keep=`&name=${encodeURIComponent(displayName)}&email=${encodeURIComponent(email)}`;
 const fail=(message:string):never=>redirect(`/signup?error=${encodeURIComponent(message)}${keep}`);
 if(form.get('terms')!=='on')fail('Please accept the Terms and Privacy Policy.');
 if(displayName.length<2)fail('Enter your name (at least 2 characters).');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Enter a valid email address.');
 if(password.length<10)fail('Use a password of at least 10 characters.');
 const supabase=await createSupabaseServerClient();
 const {data,error}=await supabase.auth.signUp({email,password,options:{data:{display_name:displayName},emailRedirectTo:`${await siteUrl()}/auth/callback`}});
 if(error){
  console.error('signUp failed',error.code,error.status,error.message);
  const message=error.message.toLowerCase();
  if(error.code==='user_already_exists'||message.includes('already registered'))fail('An account with this email already exists. Sign in instead.');
  if(error.code==='weak_password')fail('That password is too easy to guess. Use a longer, less common one.');
  if(error.code==='over_email_send_rate_limit'||error.status===429)fail('Too many sign-up emails were sent recently. Wait a while and try again.');
  if(message.includes('confirmation email')||message.includes('sending'))redirect('/login?error='+encodeURIComponent('Your account was created, but the verification email could not be sent. Use "Resend verification email" below, or ask the site owner to check email settings.')+'&email='+encodeURIComponent(email));
  fail('We could not create the account. Please try again in a moment.');
 }
 if(data.user&&data.user.identities&&data.user.identities.length===0)fail('An account with this email already exists. Sign in instead.');
 redirect('/login?error='+encodeURIComponent('Account created. Check your email (and spam folder) to verify it, then sign in.')+'&email='+encodeURIComponent(email));
}
export async function resendVerification(form:FormData){
 const email=String(form.get('email')??'').trim().toLowerCase();
 if(!email)redirect('/login?error='+encodeURIComponent('Enter your email to resend the verification link.'));
 const supabase=await createSupabaseServerClient();
 const {error}=await supabase.auth.resend({type:'signup',email,options:{emailRedirectTo:`${await siteUrl()}/auth/callback`}});
 if(error){
  console.error('resend failed',error.code,error.status,error.message);
  const limited=error.code==='over_email_send_rate_limit'||error.status===429;
  redirect('/login?error='+encodeURIComponent(limited?'Too many emails were sent recently. Wait a while and try again.':'We could not send the verification email. Please try again later.')+'&email='+encodeURIComponent(email));
 }
 redirect('/login?error='+encodeURIComponent('Verification email sent. Check your inbox and spam folder.')+'&email='+encodeURIComponent(email));
}
export async function signOut(){const supabase=await createSupabaseServerClient();await supabase.auth.signOut();redirect('/login');}

export async function forgotPassword(formData:FormData){
 const email=String(formData.get('email')??'').trim().toLowerCase();
 if(!email)redirect('/forgot-password');
 const supabase=await createSupabaseServerClient();
 await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${await siteUrl()}/auth/callback?next=/reset-password`});
 // Always show the same response to avoid account enumeration.
 redirect('/forgot-password?sent=1');
}
export async function updatePassword(formData:FormData){
 const password=String(formData.get('password')??'');
 if(password.length<10)redirect('/reset-password?error=Password%20must%20be%20at%20least%2010%20characters');
 const supabase=await createSupabaseServerClient();
 const {data:{user},error:authError}=await supabase.auth.getUser();
 if(authError||!user)redirect('/login?error=Open%20the%20password%20recovery%20link%20again');
 const {error}=await supabase.auth.updateUser({password});
 if(error)redirect('/reset-password?error=Unable%20to%20update%20password');
 redirect('/login?error=Password%20updated.%20Please%20sign%20in.');
}
