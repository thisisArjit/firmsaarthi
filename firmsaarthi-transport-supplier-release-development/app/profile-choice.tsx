'use client';
export type ProviderProfile='transporter'|'supplier';
export default function ProfileChoice({onChoose}:{onChoose:(profile:ProviderProfile)=>void}){
 return <section className="login-profile-choice" aria-label="Choose your profile"><p className="help">Choose the workspace that fits your business.</p><div className="login-profile-options"><button type="button" aria-label="Transport provider" onClick={()=>onChoose('transporter')}><strong>Transport provider</strong><span>I arrange transport and manage trips, customers and billing.</span></button><button type="button" aria-label="Truck provider" onClick={()=>onChoose('supplier')}><strong>Truck provider</strong><span>I provide trucks and maintain my fleet, preferred routes and business contact details.</span></button></div><p className="help">Already have an account? Sign in to keep your existing workspace and access.</p></section>;
}
