// @vitest-environment jsdom
import {test,afterEach,vi} from 'vitest';
import assert from 'node:assert/strict';
import {render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {browserFixture} from './helpers/browser';
import {routeHandlers} from './helpers/api';
import * as taxRoute from '../app/api/tax-export/route';
import TaxExportPanel from '../app/tax-export-panel';
import {workspaceChanged} from '../lib/workspace-sync';
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();delete routeHandlers['/api/tax-export'];});
test('CA export UI prepares actual registers and ZIP, clears stale download links and preserves selected dates on shared refresh',async()=>{const f=await browserFixture();try{routeHandlers['/api/tax-export']=taxRoute;delete f.env.BILLING_ADMIN_USER_ID;await f.seed();const user=userEvent.setup(),clicked:string[]=[];vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){clicked.push(this.download);});render(<TaxExportPanel year="2026-2027"/>);assert.equal(screen.queryByRole('button',{name:'Download ZIP'}),null);await user.click(screen.getByRole('button',{name:'Prepare export'}));await screen.findByRole('button',{name:'Download ZIP'});assert.ok(screen.getByText('invoice-register.csv'));await user.click(screen.getByRole('button',{name:'Download ZIP'}));await waitFor(()=>assert.equal(clicked[0],'CA-review-2026-04-01-2027-03-31.zip'));assert.ok(f.calls.some(c=>c.path.includes('file=all.zip')));workspaceChanged();await waitFor(()=>assert.ok(screen.getByRole('button',{name:'Download ZIP'})));await user.clear(screen.getByLabelText('From date'));await user.type(screen.getByLabelText('From date'),'2026-10-01');assert.equal(screen.queryByRole('button',{name:'Download ZIP'}),null);workspaceChanged();assert.equal((screen.getByLabelText('From date') as HTMLInputElement).value,'2026-10-01');}finally{f.sqlite.close();}});
