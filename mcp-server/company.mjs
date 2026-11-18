import { isValidSiren } from './invoice.mjs';

// Public French company register (INSEE SIRENE data, no API key). Not the e-invoicing annuaire:
// it says whether a company exists and is active, not which platform receives its invoices.
const API = 'https://recherche-entreprises.api.gouv.fr';

export async function lookupCompany(siren, fetchImpl = fetch) {
  const s = String(siren ?? '').replace(/\s/g, '');
  if (!isValidSiren(s)) return { siren: s, error: 'not a valid SIREN (9 digits with a correct check digit)' };
  let res;
  try {
    res = await fetchImpl(`${API}/search?q=${s}&per_page=5`, { signal: AbortSignal.timeout(8000) });
  } catch (e) {
    return { siren: s, error: `register unreachable: ${e.message}` };
  }
  if (!res.ok) return { siren: s, error: `register returned HTTP ${res.status}` };
  const hit = ((await res.json()).results ?? []).find((r) => r.siren === s);
  if (!hit) return { siren: s, error: 'not found in the company register' };
  return {
    siren: s, name: hit.nom_complet, active: hit.etat_administratif === 'A', created: hit.date_creation,
    closed: hit.date_fermeture ?? null, legalForm: hit.nature_juridique, activity: hit.activite_principale,
    size: hit.categorie_entreprise, headOffice: hit.siege?.adresse, source: API,
  };
}
