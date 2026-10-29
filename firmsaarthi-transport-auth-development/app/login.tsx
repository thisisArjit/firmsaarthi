'use client';
import { workspaceFetch as fetch } from '@/lib/workspace-sync';
import { useEffect, useState, type FormEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import BrandMark from './brand-mark';
import SignupEmailForm from './signup-email-form';
export default function Login(){
  const [mode,setMode]=useState<'login'|'signup'>('login'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[businessName,setBusinessName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[googleEnabled,setGoogleEnabled]=useState(false);
  useEffect(()=>{const code=new URLSearchParams(window.location.search).get('auth');const messages:Record<string,string>={'link-required':'Continue with Google again to sign in to your existing profile.','email-confirmation-required':'This Google account uses an externally hosted email. Sign in once with your password, then link Google in My account to confirm ownership.','signup-required':'No linked account found. Create an account, or sign in with your password to link Google.','google-failed':'Google sign-in was not completed. Please try again.'};if(code)setError(messages[code]||messages['google-failed']);fetch('/api/auth').then(r=>r.ok?r.json() as Promise<{googleEnabled:boolean}>:null).then(v=>setGoogleEnabled(!!v?.googleEnabled)).catch(()=>{});},[]);
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{
    const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',email,password})});
    const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error||'Unable to sign in.');
    setPassword('');window.location.replace('/');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function google(){setBusy(true);setError('');try{const r=await fetch('/api/auth/google/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intent:'signup',businessName:businessName.trim()||'My business'})}),v=await r.json() as {error?:string;url:string};if(!r.ok)throw new Error(v.error);window.location.assign(v.url);}catch(e){setError((e as Error).message);setBusy(false);}}
  function switchMode(){setMode(mode==='login'?'signup':'login');setPassword('');setError('');}
  return <main className="login-page"><section className="login-card"><div className="login-brand"><span className="brand-icon"><BrandMark size={40}/></span><div><strong>FirmSaarthi</strong><small>TRANSPORT</small></div></div><h1>{mode==='login'?'Sign in':'Create account'}</h1><p className="help">{mode==='login'?'Sign in to your transport workspace.':'Confirm your email to create an account.'}</p>{mode==='signup'?<SignupEmailForm initialEmail={email} onEmailChange={setEmail} onBusinessNameChange={setBusinessName} onBusyChange={setBusy}/>:<form onSubmit={submit}>
    <label className="field"><span>Email address</span><input type="email" name="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254}/></label><label className="field"><span>Password</span><input type="password" name="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={1024}/></label>
    {error&&<p className="alert error" role="alert">{error}</p>}<button className="primary" disabled={busy}><LockKeyhole size={16}/>{busy?'Please wait…':'Sign in'}</button></form>}
    {mode==='signup'&&error&&<p className="alert error" role="alert">{error}</p>}{googleEnabled&&<><div className="login-divider">or</div><button className="google-button" disabled={busy} onClick={google}>Continue with Google</button><p className="help login-note">Sign in or create an account with Google.</p></>}
    <p className="help login-note">{mode==='login'?'New to FirmSaarthi?':'Already have an account?'} <button className="text-link login-switch" disabled={busy} onClick={switchMode}>{mode==='login'?'Create account':'Sign in'}</button></p>
    {mode==='login'?<><a className="text-link" href="/account/forgot">Forgot password?</a></>:<p className="help">Joining an existing team? Ask the workspace owner to create your account.</p>}
    </section><p className="login-footer">A private workspace for your transport business.</p></main>;
}
