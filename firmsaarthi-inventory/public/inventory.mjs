import {StockClient,formatQuantity} from './stock-client.mjs';
const recoveryStorage={getItem:key=>sessionStorage.getItem(key),setItem:(key,value)=>sessionStorage.setItem(key,value),removeItem:key=>sessionStorage.removeItem(key)};
const client=new StockClient(undefined,{storage:recoveryStorage}),$=id=>document.getElementById(id),movement=$('movement-form');
let history=null,historyEpoch=0,loaded=false,reversal=null;
const text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;return node;};
function message(value,error=false){$('message').textContent=value;$('message').classList.toggle('error',error);}
function fail(error){
 message(error.message,true);
 if(error.identityChanged||[401,403].includes(error.status)){
  loaded=false;client.state=null;client.pending=null;$('stock-rows').replaceChildren();$('item-list').replaceChildren();$('warehouse-list').replaceChildren();$('history-rows').replaceChildren();$('history-for').textContent='';$('review-description').textContent='';$('history').hidden=true;
  for(const form of document.forms){form.reset();for(const control of form.elements)control.disabled=true;}
  if($('review').open)$('review').close();if($('reverse-reason').open)$('reverse-reason').close();reversal=null;$('reverse-source').textContent='';message(error.message+' Reload after signing in to your Inventory workspace.',true);
 }
}
function selectOptions(select,rows,label,empty){
 const previous=select.value;select.replaceChildren();if(empty!==undefined){const o=text('option',empty);o.value='';select.append(o);}
 for(const row of rows){const o=text('option',label(row));o.value=row.id;select.append(o);}
 if([...select.options].some(o=>o.value===previous))select.value=previous;
}
function simpleTable(head,rows){const table=document.createElement('table'),thead=document.createElement('thead'),tr=document.createElement('tr');for(const name of head)tr.append(text('th',name));thead.append(tr);table.append(thead);const tbody=document.createElement('tbody');for(const values of rows){const row=document.createElement('tr');for(const value of values)row.append(text('td',value));tbody.append(row);}table.append(tbody);return table;}
function render(){
 const state=client.state;if(!state)return;
 const items=state.items.filter(i=>i.active),warehouses=state.warehouses.filter(w=>w.active);
 selectOptions($('filter-item'),items,i=>i.sku+' · '+i.name,'All items');selectOptions($('filter-warehouse'),warehouses,w=>w.name,'All warehouses');
 selectOptions(movement.elements.itemId,items,i=>i.sku+' · '+i.name,'Choose item');selectOptions(movement.elements.warehouseId,warehouses,w=>w.name,'Choose warehouse');
 $('item-list').replaceChildren(simpleTable(['SKU','Item','Base unit'],state.items.map(i=>[i.sku,i.name,i.unit])));
 $('warehouse-list').replaceChildren(simpleTable(['Code','Warehouse'],state.warehouses.map(w=>[w.code,w.name])));
 for(const node of document.querySelectorAll('.owner')){node.hidden=client.role!=='owner';if(node.tagName==='OPTION')node.disabled=client.role!=='owner';}
 for(const element of movement.elements)element.disabled=client.role==='viewer';
 $('role-note').textContent=client.role==='viewer'?'Your access is view only.':client.role==='operator'?'Receive or issue stock. An owner handles adjustments and reversals.':'Receive, issue or record a reasoned adjustment.';
 renderStock();
}
function renderStock(){
 if(!client.state)return;const {items,warehouses,balances}=client.state,rows=$('stock-rows'),balanceMap=new Map(balances.map(b=>[b.item_id+'|'+b.warehouse_id,b]));rows.replaceChildren();let capped=false;
 stockRows:for(const item of items.filter(i=>i.active&&(!$('filter-item').value||i.id===$('filter-item').value)))for(const warehouse of warehouses.filter(w=>w.active&&(!$('filter-warehouse').value||w.id===$('filter-warehouse').value))){
  if(rows.children.length===200){capped=true;break stockRows;}const balance=balanceMap.get(item.id+'|'+warehouse.id),tr=document.createElement('tr');
  for(const value of [item.sku,item.name,warehouse.name,formatQuantity(balance?.quantity||0)+' '+item.unit])tr.append(text('td',value));
  const cell=document.createElement('td'),button=text('button','View history');button.type='button';button.addEventListener('click',()=>openHistory(item.id,warehouse.id));cell.append(button);tr.append(cell);rows.append(tr);
 }
 $('stock-empty').textContent=capped?'Showing the first 200 combinations. Select an item or warehouse to narrow the view.':rows.children.length?'':'Add an item and warehouse to start recording stock.';
}
async function refresh(){
 $('refresh').disabled=true;try{await client.load();render();loaded=true;message('Records refreshed. Your unfinished forms are preserved.');if(client.recovered&&client.pending&&!$('review').open){$('review-description').textContent='Recovered '+client.pending.kind.replaceAll('_',' ')+(client.pending.quantity?' · '+client.pending.quantity:'')+'. Reason: '+client.pending.reason;$('review-error').textContent='The previous result is uncertain. Check the same request before recording another movement.';$('confirm').textContent='Retry same request';$('cancel-review').disabled=true;$('review').showModal();}if(history)await loadHistory(false);}catch(error){fail(error);}finally{$('refresh').disabled=false;}
}
async function openHistory(item,warehouse){history={item,warehouse,next:null};$('history').hidden=false;await loadHistory(false);$('history').scrollIntoView({behavior:'smooth'});}
async function loadHistory(append){
 if(!history||!loaded)return;const target=history,epoch=++historyEpoch;const query=new URLSearchParams({item:target.item,warehouse:target.warehouse,after:String(append?target.next||0:0)});$('more-history').disabled=true;
 try{
  const data=await client.request('/api/history?'+query);if(epoch!==historyEpoch||target!==history)return;
  if(!append)$('history-rows').replaceChildren();const item=client.state.items.find(i=>i.id===target.item),warehouse=client.state.warehouses.find(w=>w.id===target.warehouse);
  $('history-for').textContent=(item?.sku||'Item')+' · '+(warehouse?.name||'Warehouse');
  for(const record of data.records){
   const row=document.createElement('tr');for(const value of [new Date(record.recorded_at).toLocaleString('en-IN'),record.kind.replaceAll('_',' '),formatQuantity(record.delta)+' '+(item?.unit||''),record.reason,record.actor])row.append(text('td',value));row.children[3].className='reason';
   const cell=document.createElement('td');if(client.role==='owner'&&record.kind!=='reverse'){
    const button=text('button','Reverse');button.type='button';button.addEventListener('click',()=>{reversal={id:record.id,description:'Reverse '+formatQuantity(record.delta)+' '+item.unit+' · '+record.reason};$('reverse-form').reset();$('reverse-source').textContent=reversal.description;$('reverse-reason').showModal();});cell.append(button);
   }row.append(cell);$('history-rows').append(row);
  }
  target.next=data.next;$('more-history').hidden=!data.next;
 }catch(error){fail(error);}finally{if(epoch===historyEpoch)$('more-history').disabled=false;}
}
function review(input,description){
 try{client.review(input);$('review-description').textContent=description||`${input.kind.replaceAll('_',' ')} ${input.quantity} · ${client.state.items.find(i=>i.id===input.itemId)?.name} · ${client.state.warehouses.find(w=>w.id===input.warehouseId)?.name}. Reason: ${input.reason}`;$('review-error').textContent='';$('cancel-review').disabled=false;$('confirm').textContent='Confirm movement';$('review').showModal();}catch(error){fail(error);}
}
movement.addEventListener('submit',event=>{event.preventDefault();review(Object.fromEntries(new FormData(movement)));});
$('reverse-form').addEventListener('submit',event=>{event.preventDefault();if(!reversal)return;const reason=new FormData(event.currentTarget).get('reason');$('reverse-reason').close();review({kind:'reverse',reverses:reversal.id,reason},reversal.description+'. Reason: '+reason);});
$('cancel-reverse').addEventListener('click',()=>{$('reverse-reason').close();reversal=null;});
$('review').addEventListener('cancel',event=>{event.preventDefault();if(!client.busy&&!client.ambiguous){client.cancel();$('review').close();}});
$('cancel-review').addEventListener('click',()=>{try{client.cancel();$('review').close();}catch(error){$('review-error').textContent=error.message;}});
$('confirm').addEventListener('click',async()=>{
 $('confirm').disabled=true;$('cancel-review').disabled=true;
 try{const record=await client.confirm();$('review').close();movement.reset();await refresh();message(record.replayed?'This movement was already recorded. No duplicate was posted.':'Stock movement recorded.');}
 catch(error){if(error.identityChanged||[401,403].includes(error.status)){fail(error);return;}$('review-error').textContent=error.message;$('confirm').textContent=client.ambiguous?'Retry same request':'Confirm movement';if(!client.ambiguous){await refresh();$('review-error').textContent=error.message+' Go back and review the latest stock before changing the request.';}}
 finally{$('confirm').disabled=false;$('cancel-review').disabled=client.ambiguous;}
});
for(const [id,path]of [['item-form','/api/items'],['warehouse-form','/api/warehouses']])$(id).addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;
 try{const session=await client.request('/api/session');if(JSON.stringify([session.workspace,session.actor])!==client.identity)throw Object.assign(Error('Your workspace changed.'),{identityChanged:true});await client.request(path,Object.fromEntries(new FormData(form)));form.reset();await refresh();message('Saved. Shared stock views are updated.');}catch(error){fail(error);if(error.ambiguous)message('Save status is uncertain. Refresh records and check the code before trying again.',true);}finally{button.disabled=!loaded;}
});
$('refresh').addEventListener('click',refresh);$('filter-item').addEventListener('change',renderStock);$('filter-warehouse').addEventListener('change',renderStock);$('more-history').addEventListener('click',()=>loadHistory(true));
// Refresh changes the shared read model only; form values and reviewed intent stay intact.
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&loaded&&!client.busy)refresh();});
await refresh();
