import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupCompany } from '../company.mjs';

const fakeFetch = (body, status = 200) => async () => ({ ok: status === 200, status, json: async () => body });
const danone = { siren: '130019771', nom_complet: 'AGENCE POUR L\'INFORMATIQUE FINANCIERE DE L\'ETAT (AIFE)', etat_administratif: 'A', date_creation: '1955-01-01',
  date_fermeture: null, nature_juridique: '5599', activite_principale: '70.10Z', categorie_entreprise: 'GE',
  siege: { adresse: 'IMMEUBLE MINEFI 10 RUE DU CENTRE 93160 NOISY-LE-GRAND' } };

test('returns a compact record for an exact SIREN match', async () => {
  const r = await lookupCompany('130019771', fakeFetch({ results: [danone] }));
  assert.deepEqual(r, { siren: '130019771', name: 'AGENCE POUR L\'INFORMATIQUE FINANCIERE DE L\'ETAT (AIFE)', active: true, created: '1955-01-01', closed: null,
    legalForm: '5599', activity: '70.10Z', size: 'GE', headOffice: 'IMMEUBLE MINEFI 10 RUE DU CENTRE 93160 NOISY-LE-GRAND',
    source: 'https://recherche-entreprises.api.gouv.fr' });
});

test('rejects an invalid SIREN without calling the API', async () => {
  let called = false;
  const r = await lookupCompany('130019772', async () => { called = true; });
  assert.equal(called, false);
  assert.match(r.error, /check digit/);
});

test('unknown SIREN and API failure', async () => {
  assert.match((await lookupCompany('130019771', fakeFetch({ results: [] }))).error, /not found/);
  assert.match((await lookupCompany('130019771', fakeFetch({}, 503))).error, /503/);
});
