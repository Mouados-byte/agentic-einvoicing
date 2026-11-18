import { readFileSync } from 'node:fs';

const RULES = JSON.parse(readFileSync(new URL('./rules.json', import.meta.url), 'utf8'));

const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const STOP = new Set(['le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'ou', 'a', 'en', 'pour', 'ses', 'sa', 'son',
  'quand', 'doit', 'quel', 'quelle', 'est', 'ce', 'que', 'qui', 'the', 'is', 'what', 'when', 'do', 'does', 'my', 'how', 'in', 'of']);

const indexed = RULES.map((r) => ({
  rule: r,
  keywords: r.keywords.map(norm),
  text: norm(`${r.title} ${r.rule}`),
}));

// Keyword hits weigh 3, plain text hits 1. Good enough for a dozen rules; swap for embeddings if the base grows.
export function searchRules(query, limit = 3) {
  const terms = norm(query).split(/[^\p{L}\p{N}-]+/u).filter((t) => t.length > 1 && !STOP.has(t));
  return indexed
    .map(({ rule, keywords, text }) => ({
      rule,
      score: terms.reduce((s, t) => s + (keywords.some((k) => k === t || k.split(' ').includes(t)) ? 3 : 0) + (text.includes(t) ? 1 : 0), 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.rule);
}

export const getRule = (id) => RULES.find((r) => r.id === id);
