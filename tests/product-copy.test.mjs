import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = path => readFileSync(path, 'utf8');
test('Routine product screens contain customer-facing copy', () => {
  const files = readdirSync('app').filter(name => name.endsWith('.tsx'));
  for (const name of files) {
    assert.doesNotMatch(read(join('app', name)), /No ChatGPT account is needed|your old app|documented adapter|runtime configuration|Candidate route:/i, name);
  }
  assert.match(read('app/login.tsx'), /Sign in to your transport workspace\./);
  assert.match(read('app/transport-desk.tsx'), /invitation emails are not sent/);
});

test('Operational limitations remain clear', () => {
  assert.match(read('app/gps-panel.tsx'), /Updates are manual, not continuous/);
  assert.match(read('app/integrations-panel.tsx'), /Imported records are not verified with the provider/);
  assert.match(read('app/vehicles-panel.tsx'), /not an automatic government verification/);
  assert.match(read('app/transport-desk.tsx'), /Reissuing recalculates the line items/);
  assert.match(read('app/finance-panel.tsx'), /Provisional management P&L/);
});
