import {signUp} from '../auth/actions';

export default async function Signup(props:{searchParams:Promise<{error?:string;name?:string;email?:string}>}){
  const {error,name,email}=await props.searchParams;
  return <main className="auth"><form action={signUp}><p>LEADPILOT AI</p><h1>Create your workspace.</h1>
    {error&&<small role="alert" className="err">{error}</small>}
    <label>Name<input name="displayName" minLength={2} maxLength={80} defaultValue={name??''} autoComplete="name" required/></label>
    <label>Email<input name="email" type="email" autoComplete="email" defaultValue={email??''} required/></label>
    <label>Password<input name="password" type="password" minLength={10} autoComplete="new-password" required/><span className="hint">At least 10 characters.</span></label>
    <label className="terms"><input name="terms" type="checkbox" required/> I accept the Terms and Privacy Policy.</label>
    <button>Create account</button><a href="/login">Already have an account? Sign in</a></form>
  <style>{`.auth{min-height:100vh;display:grid;place-items:center;background:#07101b;color:#edf5fa;font-family:system-ui}.auth form{width:min(90%,420px);display:grid;gap:15px;padding:28px;background:#0c1824;border:1px solid #294052;border-radius:16px}.auth p{color:#74dfbd;font-weight:800;letter-spacing:.15em}.auth h1{font-size:34px;margin:0}.auth label{display:grid;gap:7px}.auth input:not([type=checkbox]){padding:13px;background:#07111c;border:1px solid #294052;border-radius:8px;color:white}.auth .terms{display:flex;align-items:center;gap:9px}.auth button{padding:14px;background:#74dfbd;border:0;border-radius:8px;font-weight:800}.auth a{color:#74dfbd}.auth .err{padding:10px 12px;border:1px solid #6b2b36;border-radius:10px;background:#2a1018;color:#ffb5b5;line-height:1.4}.auth .hint{color:#8fa3b3;font-size:12px}`}</style></main>;
}
