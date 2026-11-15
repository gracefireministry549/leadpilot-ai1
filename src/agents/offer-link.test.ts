import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedPaystackCurrency, toPaystackMinorUnits } from './offer-link';

test('converts a NGN offer amount from naira to kobo', () => {
  assert.equal(toPaystackMinorUnits(5_000, 'NGN'), 500_000);
});

test('converts supported two-decimal currencies to minor units', () => {
  assert.equal(toPaystackMinorUnits(125, 'USD'), 12_500);
  assert.equal(toPaystackMinorUnits(12.5, 'USD'), 1_250);
  assert.equal(toPaystackMinorUnits(75, 'GHS'), 7_500);
  assert.equal(toPaystackMinorUnits(80, 'KES'), 8_000);
});

test('does not multiply zero-decimal XOF amounts', () => {
  assert.equal(toPaystackMinorUnits(5_000, 'XOF'), 5_000);
});

test('rejects unsupported currencies and unsafe amounts', () => {
  assert.equal(isSupportedPaystackCurrency('JPY'), false);
  assert.equal(toPaystackMinorUnits(10, 'JPY'), null);
  assert.equal(toPaystackMinorUnits(0, 'NGN'), null);
  assert.equal(toPaystackMinorUnits(1.001, 'NGN'), null);
  assert.equal(toPaystackMinorUnits(Number.MAX_SAFE_INTEGER, 'NGN'), null);
});
