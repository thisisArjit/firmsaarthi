// @vitest-environment jsdom
import {afterEach,test,vi} from 'vitest';
import assert from 'node:assert/strict';
import {cleanup,render,screen,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {browserFixture} from './helpers/browser';
import FinancePanel from '../app/finance-panel';
import {workspaceChanged} from '../lib/workspace-sync';

const year='2026-2027';
const dbs:{close:()=>void}[]=[];
async function fixture(){const f=await browserFixture();dbs.push(f.sqlite);delete f.env.BILLING_ADMIN_USER_ID;return {...f,user:userEvent.setup()};}
afterEach(()=>{cleanup();for(const db of dbs.splice(0))db.close();vi.unstubAllGlobals();vi.restoreAllMocks();});
const voucher=()=>({year,date:'2026-10-26',category:'rent',amount:1000,description:'Synthetic yard rent',recoverableTax:180,paidAmount:500});

test('voucher UI preserves draft input on refresh and requires explicit post and void without creating settlement payments',async()=>{
  const f=await fixture();await f.seed();const changed=vi.fn(async()=>{});
  render(<FinancePanel year={year} view="register" revision={0} consignments={[]} onChange={changed}/>);
  await screen.findByText('Finance vouchers');
  await f.user.click(screen.getByRole('button',{name:'Add voucher'}));
  const dialog=screen.getByRole('dialog');
  await f.user.clear(within(dialog).getByLabelText('Recognition date'));
  await f.user.type(within(dialog).getByLabelText('Recognition date'),'2026-10-26');
  await f.user.type(within(dialog).getByLabelText('Description'),'Synthetic yard rent');
  await f.user.type(within(dialog).getByLabelText('Recognized amount (INR, excludes recoverable tax)'),'1000');
  await f.user.clear(within(dialog).getByLabelText('Recoverable input tax (INR)'));
  await f.user.type(within(dialog).getByLabelText('Recoverable input tax (INR)'),'180');
  await f.user.clear(within(dialog).getByLabelText('Already paid / received (INR)'));
  await f.user.type(within(dialog).getByLabelText('Already paid / received (INR)'),'500');
  const reads=f.calls.length;workspaceChanged();
  await waitFor(()=>assert.ok(f.calls.length>reads));
  assert.equal((within(dialog).getByLabelText('Description') as HTMLInputElement).value,'Synthetic yard rent');
  await f.user.click(within(dialog).getByRole('button',{name:'Save draft'}));
  await screen.findByRole('button',{name:'Edit'});
  let row=f.sqlite.prepare('SELECT * FROM finance_entries').get()!;
  assert.equal(row.status,'draft');assert.equal(row.amount,100000);assert.equal(row.recoverable_tax,18000);assert.equal(row.paid_amount,50000);
  assert.equal((await f.owner.financeReport(year)).report.overheads,0);
  await f.user.click(screen.getByRole('button',{name:'Post'}));
  await f.user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Cancel'}));
  assert.equal(f.sqlite.prepare('SELECT status FROM finance_entries').get()!.status,'draft');
  await f.user.click(screen.getByRole('button',{name:'Post'}));
  await f.user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Confirm posting'}));
  await waitFor(()=>assert.equal(f.sqlite.prepare('SELECT status FROM finance_entries').get()!.status,'posted'));
  await waitFor(()=>assert.equal(screen.queryByRole('button',{name:'Edit'}),null));
  assert.equal((await f.owner.financeReport(year)).report.overheads,100000);
  await f.user.click(screen.getByRole('button',{name:'Void'}));
  await f.user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Confirm void'}));
  await screen.findByText('void',{exact:true,selector:'.badge'});
  row=f.sqlite.prepare('SELECT * FROM finance_entries').get()!;
  assert.equal(row.status,'void');assert.equal(row.version,3);assert.equal(row.amount,100000);
  const report=(await f.owner.financeReport(year)).report;
  assert.equal(report.overheads,0);assert.equal(report.revenue,200000);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM invoice_receipts').get()!.n,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM supplier_payments').get()!.n,0);
  assert.equal(changed.mock.calls.length,3);
});

test('a concurrently posted voucher rejects stale UI edits and keeps the unsaved replacement visible',async()=>{
  const f=await fixture();const saved=await f.owner.command('finance.save',voucher());
  render(<FinancePanel year={year} view="register" revision={0} consignments={[]} onChange={async()=>{}}/>);
  await f.user.click(await screen.findByRole('button',{name:'Edit'}));
  const dialog=screen.getByRole('dialog');
  await f.user.clear(within(dialog).getByLabelText('Description'));
  await f.user.type(within(dialog).getByLabelText('Description'),'Unfinished replacement');
  await f.owner.command('finance.post',{id:saved.id,version:1});
  await f.user.click(within(dialog).getByRole('button',{name:'Save draft'}));
  await within(dialog).findByRole('alert');
  assert.match(within(dialog).getByRole('alert').textContent!,/Only draft vouchers/);
  assert.equal((within(dialog).getByLabelText('Description') as HTMLInputElement).value,'Unfinished replacement');
  const row=f.sqlite.prepare('SELECT * FROM finance_entries WHERE id=?').get(saved.id)!;
  assert.equal(row.status,'posted');assert.equal(row.version,2);assert.equal(row.description,'Synthetic yard rent');
  assert.equal((await f.owner.financeReport(year)).report.overheads,100000);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='finance.save'").get()!.n,1);
});

test('profitability UI shows recognized income and costs, excluding draft vouchers and recovering after invalid dates',async()=>{
  const f=await fixture();await f.seed();
  const saved=await f.owner.command('finance.save',voucher());
  render(<FinancePanel year={year} view="report" revision={0} consignments={[]} onChange={async()=>{}}/>);
  await screen.findByRole('heading',{name:'Company profit & loss'});
  const statement=screen.getByRole('heading',{name:'Company profit & loss'}).parentElement!;
  assert.match(within(statement).getByText('Transport revenue').parentElement!.textContent!,/2,000/);
  assert.match(within(statement).getByText('Recorded net profit / loss').parentElement!.textContent!,/2,000/);
  await f.owner.command('finance.post',{id:saved.id,version:1});workspaceChanged();
  await waitFor(()=>assert.match(within(statement).getByText('Operating expenses').parentElement!.textContent!,/1,000/));
  assert.match(within(statement).getByText('Recorded net profit / loss').parentElement!.textContent!,/1,000/);
  await f.user.clear(screen.getByLabelText('From'));
  await screen.findByRole('alert');assert.equal(screen.getByRole('alert').textContent,'Choose both report dates.');
  assert.equal((screen.getByRole('button',{name:'CSV + detail'}) as HTMLButtonElement).disabled,true);
  await f.user.type(screen.getByLabelText('From'),'2026-11-01');
  await screen.findByText('No recognized activity in this period.');
  assert.equal((screen.getByRole('button',{name:'CSV + detail'}) as HTMLButtonElement).disabled,false);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM finance_entries').get()!.n,1);
});

test('profitability CSV export uses the selected period and protects formula-like source references',async()=>{
  const f=await fixture();
  const saved=await f.owner.command('finance.save',{...voucher(),reference:'=1+1'});
  await f.owner.command('finance.post',{id:saved.id,version:1});
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  render(<FinancePanel year={year} view="report" revision={0} consignments={[]} onChange={async()=>{}}/>);
  await screen.findByRole('heading',{name:'Company profit & loss'});
  await f.user.click(screen.getByRole('button',{name:'CSV + detail'}));
  const blob=vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
  const text=await blob.text();
  assert.ok(text.includes('"Provisional company P&L","2026-04-01","2027-03-31"'));
  assert.ok(text.includes('"Operating expenses","\'-1000.00"'));
  assert.ok(text.includes('"\'=1+1"'));
  assert.ok(!text.includes(',"=1+1",'));
  assert.equal(click.mock.calls.length,1);
  assert.equal((click.mock.instances[0] as HTMLAnchorElement).download,'FirmSaarthi-PnL-2026-04-01-2027-03-31.csv');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM finance_entries').get()!.n,1);
});
