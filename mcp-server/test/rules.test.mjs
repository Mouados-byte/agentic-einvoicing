import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchRules, getRule } from '../rules.mjs';

test('finds the issuing deadline for SMEs, accent-insensitive', () => {
  const [top] = searchRules('quand une PME doit emettre ses factures ?');
  assert.equal(top.id, 'FR-CAL-02');
});

test('finds the Peppol identifier rule', () => {
  const ids = searchRules('identifiant peppol 0225').map((r) => r.id);
  assert.equal(ids[0], 'FR-PEP-02');
});

test('returns nothing for an unrelated query', () => {
  assert.deepEqual(searchRules('recette de la tarte tatin'), []);
});

test('limits results', () => {
  assert.ok(searchRules('facture électronique peppol plateforme format', 2).length <= 2);
});

test('getRule returns a rule by id, undefined otherwise', () => {
  assert.equal(getRule('FR-SAN-01').title, 'Sanctions');
  assert.equal(getRule('nope'), undefined);
});
