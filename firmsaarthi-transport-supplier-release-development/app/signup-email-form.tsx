'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {workspaceFetch as fetch} from '@/lib/workspace-sync';

type Props={businessKind?:'transporter'|'supplier';initialEmail:string;onEmailChange:(value:string)=>void;onBusinessNameChange:(value:string)=>void;onBusyChange:(value:boolean)=>void};
type Progress={enabled?:boolean;step?:'email'|'code'|'details';email?:string;businessKind?:string;reviewRef?:string;resendAt?:number};
export default function SignupEmailForm({businessKind='transporter',initialEmail,onEmailChange,onBusinessNameChange,onBusyChange}:Props){
 const draftKey='firmsaarthi:signup-draft:v1:'+businessKind;
 const [step,setStep]=useState<'email'|'code'|'details'>('email'),[reviewRef,setReviewRef]=useState(''),[email,setEmail]=useState(initialEmail),[code,setCode]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[enabled,setEnabled]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[resendAt,setResendAt]=useState(0),[seconds,setSeconds]=useState(0),[done,setDone]=useState(false);
 function working(value:boolean){setBusy(value);onBusyChange(value);}
 function forget(){try{sessionStorage.removeItem(draftKey);}catch{/* Optional draft storage must not block authentication. */}}
 function remember(value:string){setName(value);onBusinessNameChange(value);try{sessionStorage.setItem(draftKey,JSON.stringify({email:email.trim().toLowerCase(),businessName:value,at:Date.now()}));}catch{/* Passwords and codes are never persisted. */}}
 useEffect(()=>{let active=true;fetch('/api/auth/signup-email',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();return r.json() as Promise<Progress>;}).then(v=>{
  if(!active)return;setEnabled(!!v.enabled);
  if(v.businessKind&&v.businessKind!==businessKind){setNotice('A registration for the other workspace is in progress. Start here with your email to switch.');return;}
  if(v.enabled&&(v.step==='code'||v.step==='details')&&typeof v.email==='string'){
   setReviewRef(v.reviewRef||'');setStep(v.step);setEmail(v.email);onEmailChange(v.email);if(v.resendAt)setResendAt(v.resendAt*1000);
   if(v.step==='details')try{const draft=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(draft?.email===v.email&&typeof draft.businessName==='string'&&draft.businessName.length<=150&&Number.isFinite(draft.at)&&Date.now()>=draft.at&&Date.now()-draft.at<=600000){setName(draft.businessName);onBusinessNameChange(draft.businessName);}}catch{/* Invalid drafts never provide identity proof. */}
  }
 }).catch(()=>{if(active)setEnabled(false);});return()=>{active=false;};
 // Parent setters are stable; progress is loaded once, never over an active form.
 },[]);
 useEffect(()=>{const update=()=>setSeconds(Math.max(0,Math.ceil((resendAt-Date.now())/1000)));update();const timer=setInterval(update,1000);return()=>clearInterval(timer);},[resendAt]);
 async function command(body:Record<string,unknown>){const r=await fetch('/api/auth/signup-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,businessKind,reviewRef})}),v=await r.json() as {error?:string;message?:string;reviewRef?:string};if(!r.ok)throw Error(v.error||'Please try again.');return v;}
 function finish(){forget();setPassword('');setConfirmation('');setCode('');setDone(true);window.location.replace(businessKind==='supplier'?'/supplier':'/');}
 async function send(){working(true);setError('');try{const v=await command({action:'request',email});setReviewRef(v.reviewRef||'');setCode('');setPassword('');setConfirmation('');setNotice(v.message||'Check your email for the code.');setStep('code');setResendAt(Date.now()+60000);}catch(e){setError((e as Error).message);}finally{working(false);}}
 async function submit(e:FormEvent){e.preventDefault();if(step==='email'){await send();return;}working(true);setError('');try{
  if(step==='code'){await command({action:'verify',code});setCode('');setNotice('Email confirmed. Choose your own password and business name.');setStep('details');}
  else{if(Array.from(password).length<15||password.length>128)throw Error('Use a password of 15 to 128 characters.');if(password!==confirmation)throw Error('Passwords do not match.');await command({action:'complete',password,businessName:name});finish();}
 }catch(e){
  // This only navigates an already authenticated browser after an uncertain
  // response. The server session, not an email comparison, grants all access.
  if(step==='details')try{const auth=await fetch('/api/auth',{cache:'no-store'}),v=auth.ok?await auth.json() as {email?:string}:null;if(v?.email===email.trim().toLowerCase()){finish();return;}}catch{/* An uncertain response must not erase the reviewed details. */}
  setError((e as Error).message);
 }finally{working(false);}}
 async function restart(){working(true);setError('');try{await command({action:'cancel'});setStep('email');setReviewRef('');setCode('');setPassword('');setConfirmation('');setName('');onBusinessNameChange('');setNotice('');forget();}catch(e){setError((e as Error).message);}finally{working(false);}}
 if(done)return <p className="help" role="status">Account created. Opening your workspace…</p>;
 if(enabled===null)return <p className="help" role="status">Loading email registration…</p>;
 if(!enabled)return <p className="alert" role="status">Email registration is temporarily unavailable. Try again later, continue with Google or contact <a href="mailto:firmsaarthi@gmail.com">firmsaarthi@gmail.com</a>.</p>;
 return <><p className="help">{step==='email'?'First confirm your email. No account or password is created until you finish.':step==='code'?`Check ${email} for the six-digit confirmation code. Codes expire after 10 minutes.`:'Use a password of at least 15 characters. This creates a separate workspace for your business.'}</p>{notice&&<p className="help" role="status">{notice}</p>}
 <form onSubmit={submit}><fieldset disabled={busy} style={{border:0,padding:0,margin:0}}>
 {step==='email'?<label className="field"><span>Email address</span><input type="email" autoComplete="username" required maxLength={254} value={email} onChange={e=>{setEmail(e.target.value);onEmailChange(e.target.value);}}/></label>:step==='code'?<label className="field"><span>Six-digit code</span><input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" required minLength={6} maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>:<>
 <label className="field"><span>Business name</span><input autoComplete="organization" required maxLength={150} value={name} onChange={e=>remember(e.target.value)}/></label>
 <label className="field"><span>Password (15–128 characters)</span><input type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>
 <label className="field"><span>Confirm password</span><input type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label></>}
 {error&&<p className="alert error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Please wait…':step==='email'?'Send confirmation code':step==='code'?'Verify email':'Create account'}</button></fieldset></form>
 {step==='code'&&<p className="help"><button className="text-link" type="button" disabled={busy||seconds>0} onClick={send}>{seconds?`Resend code in ${seconds}s`:'Resend code'}</button></p>}
 {step!=='email'&&<p className="help"><button className="text-link" type="button" disabled={busy} onClick={restart}>Use another email</button></p>}
 <p className="help">Joining an existing team? Ask its workspace owner for access. An email code does not grant access to another business.</p></>;
}
