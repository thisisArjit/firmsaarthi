import {AppError} from './service';
export function businessKind(value:unknown):'transporter'|'supplier'{
  if(value===undefined||value==='transporter')return 'transporter';
  if(value==='supplier')return 'supplier';
  throw new AppError('Choose Transporter or Truck supplier. Demand access is not available yet.');
}
export async function businessMode(db:D1Database,userId:string){
  const row=await db.prepare('SELECT b.mode FROM memberships m LEFT JOIN workspace_business_modes b ON b.org_id=m.org_id WHERE m.user_id=?').bind(userId).first<{mode:string|null}>();
  return row?.mode==='supplier'?'supplier':'transporter';
}
export async function requireTransporter(db:D1Database,userId:string){
  if(await businessMode(db,userId)==='supplier')throw new AppError('This is a truck supplier workspace. Open Supplier workspace to manage your fleet and routes.',403);
}
