'use client';
import {useRef,useState} from 'react';
import type {Row} from '@/lib/domain';
import {workspaceFetch} from '@/lib/workspace-sync';

type CheckoutInstance={open:()=>void;on:(name:string,handler:()=>void)=>void};
type CheckoutWindow=Window&{Razorpay?:new(options:Row)=>CheckoutInstance};
let scriptPromise:Promise<void>|null=null;
function loadCheckout(){
  if((window as CheckoutWindow).Razorpay)return Promise.resolve();
  if(!scriptPromise)scriptPromise=new Promise<void>((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;
    const timer=setTimeout(()=>{script.remove();scriptPromise=null;reject(new Error('Payment checkout could not load. Try again.'));},15000);
    script.onload=()=>{clearTimeout(timer);if((window as CheckoutWindow).Razorpay)resolve();else{scriptPromise=null;reject(new Error('Payment checkout is unavailable.'));}};
    script.onerror=()=>{clearTimeout(timer);script.remove();scriptPromise=null;reject(new Error('Payment checkout could not load. Check your connection.'));};document.head.appendChild(script);
  });return scriptPromise;
}
export default function RazorpayCheckout({selected,paymentState,onChange}:{selected:Row|null;paymentState:Row;onChange:()=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pending,setPending]=useState<Row|null>(paymentState.pending||null);
  const request=useRef('');
  async function api(data:Row){const response=await workspaceFetch('/api/plan-payments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),value=await response.json() as Row;if(!response.ok)throw new Error(value.error||'Unable to confirm payment.');return value;}
  async function refresh(){if(!pending)return;setBusy(true);setError('');try{const result=await api({action:'refresh',id:pending.id});if(result.success){setNotice('Payment verified. Your plan access is active.');setPending(null);onChange();}else{setPending(result);setNotice(result.message||'Payment has not been completed. You can resume the same checkout.');}}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function pay(){
    const plan=selected||pending;if(!plan)return;setBusy(true);setError('');setNotice('');
    if(!request.current)request.current=crypto.randomUUID();
    try{
      await loadCheckout();const result=await api({action:'create',tier:plan.tier,interval:plan.interval,requestId:request.current});
      if(result.status==='paid'){setNotice('This payment was already recorded.');setPending(null);onChange();setBusy(false);return;}
      setPending(result);if(result.status!=='ready'){setNotice(result.message||'Check payment status before making another payment.');setBusy(false);return;}
      const Razorpay=(window as CheckoutWindow).Razorpay!;
      const checkout=new Razorpay({key:result.keyId,order_id:result.orderId,amount:result.amount,currency:'INR',name:'FirmSaarthi Transport',description:`${result.tier==='team'?'Team':'Individual'} ${result.interval==='yearly'?'Annual':'Monthly'}`,theme:{color:'#253f57'},
        handler:async(value:Row)=>{try{const verified=await api({action:'verify',id:result.id,orderId:value.razorpay_order_id,paymentId:value.razorpay_payment_id,signature:value.razorpay_signature});if(verified.success){setNotice('Payment verified. Your plan access is active.');setPending(null);onChange();}else{setNotice(verified.message);setPending({...result,status:'review'});}}catch(e){setError((e as Error).message+' Use Check payment status; do not pay again if money was deducted.');}finally{setBusy(false);}},
        modal:{ondismiss:()=>{setBusy(false);setNotice('Checkout closed. Check payment status if you completed a payment.');}},
      });checkout.on('payment.failed',()=>{setBusy(false);setNotice('Payment was not completed. Check its status before retrying the same checkout.');});checkout.open();
    }catch(e){request.current='';setError((e as Error).message);setBusy(false);}
  }
  return <div className="online-plan-payment">
    {paymentState.mode==='test'&&<p className="alert warning" role="status">Test payments only. No real money is collected.</p>}
    <p className="help">Pay securely through Razorpay. This is a one-time payment for your selected plan period; it does not set up automatic renewal.</p>
    <button className="primary" disabled={busy||(!selected&&!pending)||pending?.status==='creating'||pending?.status==='review'} onClick={pay}>{busy?'Confirming…':pending?.status==='ready'?'Continue checkout':'Pay with Razorpay'}</button>
    {pending&&<p className="help">Pending: {pending.tier==='team'?'Team':'Individual'} {pending.interval==='yearly'?'Annual':'Monthly'}. <button className="small" disabled={busy} onClick={refresh}>Check payment status</button>{['creating','review'].includes(pending.status)&&' Contact support before making another payment.'}</p>}
    {notice&&<p className="alert success" role="status">{notice}</p>}{error&&<p className="alert error" role="alert">{error}</p>}
  </div>;
}
