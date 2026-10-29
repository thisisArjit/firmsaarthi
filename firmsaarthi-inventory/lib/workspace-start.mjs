import {text} from './domain.mjs';
export class WorkspaceStartError extends Error{constructor(message,status=403){super(message);this.status=status;}}

// Only call with the server helper's Site-scoped identity. Email, Transport
// sessions and the service-access token cannot create Inventory membership.
export async function startWorkspace(binding,identity,siteId,input){
 if(typeof siteId!=='string'||!siteId||!identity||identity.siteId!==siteId||typeof identity.userId!=='string'||!identity.userId||identity.userId.length>200)throw new WorkspaceStartError('Verified Inventory identity required.');
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['name','requestId'].includes(k)))throw new WorkspaceStartError('Only a workspace name and request reference are accepted.',400);
 const name=text(input.name,'workspace name',100),requestId=text(input.requestId,'request ID',100);
 if(!/^[A-Za-z0-9_-]{8,100}$/.test(requestId))throw new WorkspaceStartError('Invalid request ID.',400);
 const db=binding.withSession?binding.withSession('first-primary'):binding,q=(sql,...values)=>db.prepare(sql).bind(...values),user=identity.userId,id=crypto.randomUUID(),payload=JSON.stringify({name});
 const results=await db.batch([
  // Both conditions run at the actual write, not an earlier HTTP preflight.
  // A disabled/existing member is never upgraded or given an escape workspace.
  q('INSERT INTO workspaces(id,name) SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM workspace_starts WHERE user_id=?) AND NOT EXISTS(SELECT 1 FROM members WHERE user_id=?) RETURNING id',id,name,user,user),
  q('INSERT INTO workspace_starts SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM workspaces WHERE id=?)',user,id,requestId,payload,new Date().toISOString(),id),
  q("INSERT INTO members SELECT ?,?,'owner' WHERE EXISTS(SELECT 1 FROM workspace_starts WHERE org_id=? AND user_id=?)",id,user,id,user),
  q("SELECT s.org_id,s.request_id,s.payload,w.name FROM workspace_starts s JOIN workspaces w ON w.id=s.org_id JOIN members m ON m.org_id=s.org_id AND m.user_id=s.user_id AND m.role='owner' WHERE s.user_id=?",user),
 ]);
 const row=results[3].results?.[0];
 if(!row)throw new WorkspaceStartError('Your Inventory membership requires review. Existing access was not changed.');
 if(row.request_id!==requestId||row.payload!==payload)throw new WorkspaceStartError('A workspace was already created. Open your existing Inventory workspace.',409);
 return {workspace:row.org_id,name:row.name,role:'owner',replayed:!results[0].results?.length};
}
