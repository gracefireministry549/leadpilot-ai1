import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreLead } from '../src/leads/scoring';
import { verifyBusiness } from '../src/leads/verification';
import type { BusinessRecord } from '../src/leads/model';

const base: BusinessRecord = {
  id: 'b1',
  name: 'Acme Ltd',
  website: 'https://acme.example',
  phone: '+1 555 0100',
  email: 'hi@acme.example',
  address: '1 Main St',
  city: 'Lagos',
  country: 'Nigeria',
  industry: 'Software',
  source: 'test',
};

test('scores a fully-evidenced lead transparently and caps at 100', () => {
  const result = scoreLead(base, [], 'Software');

  assert.equal(result.score, 100);
  assert.equal(result.label, 'HOT');
  assert.ok(result.factors.length >= 8, 'every scoring input is explained');
  assert.ok(result.factors.every((factor) => factor.explanation.trim().length > 0));
});

test('does not treat an unverified business as verified', () => {
  const sparse: BusinessRecord = {
    ...base,
    name: '   ',
    website: undefined,
    phone: undefined,
    email: undefined,
    industry: undefined,
    city: undefined,
    country: undefined,
  };
  const result = scoreLead(sparse, [], 'Software');
  const nameFactor = result.factors.find((factor) => factor.factor === 'business_name');

  assert.equal(nameFactor?.points, 0);
  assert.equal(result.score, 0);
  assert.equal(result.label, 'LOW');
});

test('falls to POTENTIAL when only partial evidence exists', () => {
  // Name + industry fit + location, but only the website as a contact channel
  // (a weaker automation signal and a lower value signal than a fully reachable business).
  const partial: BusinessRecord = { ...base, phone: undefined, email: undefined };
  const result = scoreLead(partial, [], 'Software');

  assert.equal(result.score, 67);
  assert.equal(result.label, 'POTENTIAL');
});

test('awards no industry-fit points when the industry does not match the target', () => {
  const result = scoreLead({ ...base, industry: 'Retail' }, [], 'Software');
  const fit = result.factors.find((factor) => factor.factor === 'industry_fit');

  assert.equal(fit?.points, 0);
  assert.equal(result.score, 85);
  assert.equal(result.label, 'HIGH');
});

test('awards no industry-fit points when no target industry is given', () => {
  const result = scoreLead(base, []);
  const fit = result.factors.find((factor) => factor.factor === 'industry_fit');

  assert.equal(fit?.points, 0);
  assert.equal(result.score, 85);
});

test('verification checks are evidence, not extra points', () => {
  const withoutChecks = scoreLead(base, [], 'Software');
  const withChecks = scoreLead(base, verifyBusiness(base), 'Software');

  assert.equal(withChecks.score, withoutChecks.score);
});

test('the score always equals the capped sum of its explained factors', () => {
  const fixtures: BusinessRecord[] = [
    base,
    { ...base, phone: undefined, email: undefined },
    { ...base, website: undefined, industry: 'Retail' },
    { ...base, name: '', website: undefined, phone: undefined, email: undefined, industry: undefined, city: undefined, country: undefined },
  ];

  for (const business of fixtures) {
    const result = scoreLead(business, [], 'Software');
    const sum = result.factors.reduce((total, factor) => total + factor.points, 0);
    assert.equal(result.score, Math.min(100, sum));
    assert.ok(result.score >= 0 && result.score <= 100);
  }
});

test('scoring does not mutate its input', () => {
  const input: BusinessRecord = { ...base };
  const snapshot = JSON.stringify(input);

  scoreLead(input, verifyBusiness(input), 'Software');

  assert.equal(JSON.stringify(input), snapshot);
});
