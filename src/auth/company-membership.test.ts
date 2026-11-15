import assert from 'node:assert/strict';
import test from 'node:test';
import { getActiveCompanyMembership } from './company-membership';

function fakeSupabase(result: unknown) {
  const calls: Array<[string, unknown[]]> = [];
  const query = {
    select(value: string) { calls.push(['select', [value]]); return this; },
    eq(column: string, value: unknown) { calls.push(['eq', [column, value]]); return this; },
    order(column: string, options: unknown) { calls.push(['order', [column, options]]); return this; },
    limit(value: number) { calls.push(['limit', [value]]); return this; },
    maybeSingle() { calls.push(['maybeSingle', []]); return Promise.resolve(result); },
  };
  return { client: { from(table: string) { calls.push(['from', [table]]); return query; } }, calls };
}

test('requested company is always scoped to the signed-in active membership', async () => {
  const fake = fakeSupabase({ data: { company_id: 'company-b', role: 'member' }, error: null });
  const result = await getActiveCompanyMembership(fake.client as never, 'user-1', 'company-b');
  assert.ok(result.data);
  assert.equal(result.data.company_id, 'company-b');
  assert.ok(fake.calls.some(([name, args]) => name === 'eq' && args[0] === 'company_id' && args[1] === 'company-b'));
  assert.ok(fake.calls.some(([name, args]) => name === 'eq' && args[0] === 'user_id' && args[1] === 'user-1'));
  assert.ok(fake.calls.some(([name, args]) => name === 'eq' && args[0] === 'status' && args[1] === 'active'));
});

test('default company resolution is stable and uses oldest active membership', async () => {
  const fake = fakeSupabase({ data: { company_id: 'company-oldest', role: 'owner' }, error: null });
  const result = await getActiveCompanyMembership(fake.client as never, 'user-1');
  assert.ok(result.data);
  assert.equal(result.data.company_id, 'company-oldest');
  assert.ok(fake.calls.some(([name, args]) => name === 'order' && args[0] === 'created_at'));
  assert.ok(!fake.calls.some(([name, args]) => name === 'eq' && args[0] === 'company_id'));
});
