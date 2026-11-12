import test from 'node:test';
import assert from 'node:assert/strict';
import { averageScore, bucketByWeek, chartPoints, displayNameFrom, isVerifiedLead, leadTier, percentChange, weekOverWeek } from '../src/workspace/dashboard-data.ts';

const now = new Date('2026-11-08T12:00:00Z');

test('percentChange returns null without a previous baseline', () => {
  assert.equal(percentChange(5, 0), null);
  assert.equal(percentChange(12, 10), 20);
  assert.equal(percentChange(5, 10), -50);
});
test('bucketByWeek counts only items inside the window and ignores bad dates', () => {
  const buckets = bucketByWeek(['2026-11-08T01:00:00Z', '2026-11-02T01:00:00Z', '2026-10-20T01:00:00Z', '2025-01-01T00:00:00Z', 'nope', null], now, 5);
  assert.equal(buckets.length, 5);
  assert.equal(buckets.reduce((sum, b) => sum + b.count, 0), 3);
  assert.equal(buckets[4].count, 2);
});
test('weekOverWeek compares the last 7 days with the 7 before', () => {
  assert.deepEqual(weekOverWeek(['2026-11-07T00:00:00Z', '2026-11-05T00:00:00Z', '2026-10-30T00:00:00Z'], now), { current: 2, previous: 1, change: 100 });
});
test('averageScore ignores missing scores and rounds', () => {
  assert.equal(averageScore([]), null);
  assert.equal(averageScore([{ score: 90 }, { score: 71 }, { score: null }]), 81);
});
test('verified leads need reliability confidence of at least 70', () => {
  assert.equal(isVerifiedLead({ reliability_confidence: null }), false);
  assert.equal(isVerifiedLead({ reliability_confidence: 69 }), false);
  assert.equal(isVerifiedLead({ reliability_confidence: 70 }), true);
});
test('lead tiers follow the existing 70 and 40 quality bands', () => {
  assert.deepEqual([90, 75, 45, 10, null].map(leadTier), ['Hot', 'Good', 'Medium', 'Low', 'Low']);
});
test('chartPoints scales every series against a shared maximum', () => {
  const [a, b] = chartPoints([[0, 10], [0, 5]], 100, 50, 0);
  assert.equal(a, '0.0,50.0 100.0,0.0');
  assert.equal(b, '0.0,50.0 100.0,25.0');
});
test('displayNameFrom prefers the profile name and falls back to the email', () => {
  assert.equal(displayNameFrom('Chidubem Ude', 'x@y.com'), 'Chidubem');
  assert.equal(displayNameFrom('', 'victory.ude@mail.com'), 'Victory');
  assert.equal(displayNameFrom(null, null), 'there');
});
