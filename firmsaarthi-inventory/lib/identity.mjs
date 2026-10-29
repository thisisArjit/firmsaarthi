// Server-verified native Sites identity only, not raw client headers or email.
export async function inventoryMember(db,identity,siteId){
 if(!identity||typeof identity.userId!=='string'||!identity.userId||identity.siteId!==siteId)return null;
 const rows=await db.prepare("SELECT org_id,user_id,role FROM members WHERE user_id=? AND role IN ('owner','operator','viewer') ORDER BY org_id LIMIT 2").bind(identity.userId).all();
 if(rows.results.length!==1)return null;
 const row=rows.results[0];return {orgId:row.org_id,userId:row.user_id,role:row.role};
}
