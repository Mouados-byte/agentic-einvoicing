import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkInvoice, isValidSiren } from '../invoice.mjs';

const sample = (name) => readFileSync(new URL(`../../samples/invoices/${name}`, import.meta.url), 'utf8');
const codes = (r) => r.errors.map((e) => e.code).sort();

test('SIREN check digit (Luhn)', () => {
  assert.equal(isValidSiren('130019771'), true);
  assert.equal(isValidSiren('130019772'), false);
  assert.equal(isValidSiren('13001977'), false);
  assert.equal(isValidSiren('13001977100016'), false, 'SIRET is not a SIREN');
});

test('a correct invoice passes and exposes both parties', () => {
  const r = checkInvoice(sample('ok.xml'));
  assert.deepEqual(r.errors, []);
  assert.equal(r.valid, true);
  assert.equal(r.format, 'UBL');
  assert.equal(r.seller.siren, '130019771');
  assert.equal(r.buyer.siren, '120027016');
  assert.equal(r.invoice.number, 'FA-2026-0042');
});

test('missing buyer SIREN is the new mandatory mention', () => {
  const r = checkInvoice(sample('missing-buyer-siren.xml'));
  assert.equal(r.valid, false);
  assert.deepEqual(codes(r), ['BUYER_SIREN_MISSING']);
  assert.equal(r.errors[0].rule, 'FR-MEN-01');
});

test('bad check digit and broken totals are all reported', () => {
  const r = checkInvoice(sample('errors.xml'));
  assert.deepEqual(codes(r), ['BR-CO-10', 'BR-CO-15', 'SELLER_ENDPOINT_MISMATCH', 'SELLER_SIREN_INVALID']);
});

test('neither UBL nor CII', () => {
  assert.deepEqual(codes(checkInvoice('<Order/>')), ['UNSUPPORTED_FORMAT']);
  assert.deepEqual(codes(checkInvoice('hello')), ['UNSUPPORTED_FORMAT']);
});

test('a correct CII (Factur-X XML) invoice passes, endpoint suffix is allowed', () => {
  const r = checkInvoice(sample('ok-cii.xml'));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.format, 'CII');
  assert.equal(r.invoice.issueDate, '2026-11-18');
  assert.equal(r.buyer.siren, '120027016');
  assert.equal(r.buyer.endpoint, '0225:120027016_COMPTA');
});

test('CII totals rules', () => {
  const xml = sample('ok-cii.xml').replace('<ram:GrandTotalAmount>960.00', '<ram:GrandTotalAmount>906.00')
    .replace('<ram:LineTotalAmount>800.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>',
             '<ram:LineTotalAmount>780.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>');
  assert.deepEqual(codes(checkInvoice(xml)), ['BR-CO-10', 'BR-CO-15']);
});

test('Peppol endpoint (0225) must start with the legal SIREN', () => {
  const xml = sample('ok-cii.xml').replace('120027016_COMPTA', '130019771_COMPTA');
  const r = checkInvoice(xml);
  assert.deepEqual(codes(r), ['BUYER_ENDPOINT_MISMATCH']);
  assert.equal(r.errors[0].rule, 'FR-PEP-02');
});

test('French postcode must be 5 digits (warning)', () => {
  const r = checkInvoice(sample('ok-cii.xml').replace('<ram:PostcodeCode>92120', '<ram:PostcodeCode>Blanditiis'));
  assert.deepEqual(r.warnings.map((w) => w.code), ['BUYER_POSTCODE_INVALID']);
});

test('missing delivery address is only a warning', () => {
  const r = checkInvoice(sample('ok.xml').replace(/<cac:Delivery>[\s\S]*<\/cac:Delivery>/, ''));
  assert.equal(r.valid, true);
  assert.deepEqual(r.warnings.map((w) => w.code), ['DELIVERY_ADDRESS_ABSENT']);
});
