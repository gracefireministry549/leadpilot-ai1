import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateVerifiedFinance } from '../src/workspace/finance.ts';

test('verified finance totals remain separated by currency', () => {
  const totals = aggregateVerifiedFinance([
    { status: 'verified', entry_type: 'revenue', amount_minor: 125000, currency: 'NGN' },
    { status: 'verified', entry_type: 'expense', amount_minor: 25000, currency: 'NGN' },
    { status: 'verified', entry_type: 'revenue', amount_minor: 5000, currency: 'USD' },
  ]);

  assert.deepEqual(totals, {
    NGN: { revenue: 125000, expenses: 25000 },
    USD: { revenue: 5000, expenses: 0 },
  });
});

test('unverified entries are excluded from financial summaries', () => {
  const totals = aggregateVerifiedFinance([
    { status: 'unverified', entry_type: 'revenue', amount_minor: 900000, currency: 'NGN' },
    { status: 'verified', entry_type: 'revenue', amount_minor: 2000, currency: 'NGN' },
  ]);

  assert.deepEqual(totals, {
    NGN: { revenue: 2000, expenses: 0 },
  });
});

test('invalid and unsupported amounts do not affect verified totals', () => {
  const totals = aggregateVerifiedFinance([
    { status: 'verified', entry_type: 'revenue', amount_minor: 'not-a-number', currency: 'NGN' },
    { status: 'verified', entry_type: 'transfer', amount_minor: 5000, currency: 'NGN' },
  ]);

  assert.deepEqual(totals, {
    NGN: { revenue: 0, expenses: 0 },
  });
});
