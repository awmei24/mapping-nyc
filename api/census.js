// GET /api/census?year=2024&dataset=acs/acs5&get=B01003_001E,NAME&for=tract:*&in=state:36&in=county:061
//
// A narrow pass-through to the Census API for ad-hoc pulls (new tables,
// experiments) without exposing the key. Only NYC geographies and a short list
// of datasets are allowed, and responses are cached for a day.

import { FIRST_YEAR } from '../lib/acs.js';
import { corsHeaders, json, preflight, requireKey } from '../lib/http.js';

const DATASETS = new Set(['acs/acs5', 'acs/acs5/profile', 'acs/acs5/subject', 'acs/acs1', 'dec/pl', 'dec/dhc']);
const NYC_COUNTIES = new Set(['005', '047', '061', '081', '085']);
const VAR = /^(NAME|GEO_ID|[A-Z]{1,2}\d{2,5}[A-Z]{0,3}_\d{3}[A-Z]{1,2}|[A-Z0-9]+_\d{3}N|group\([A-Z0-9]+\))$/;
const FOR = /^(county|tract|block group|zip code tabulation area|public use microdata area):(\*|[\d,]+)$/;

function bad(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function buildUrl(params) {
  const year = Number(params.get('year'));
  if (!Number.isInteger(year) || year < FIRST_YEAR - 10 || year > new Date().getFullYear()) throw bad('invalid year');
  const dataset = params.get('dataset') || 'acs/acs5';
  if (!DATASETS.has(dataset)) throw bad(`dataset must be one of: ${[...DATASETS].join(', ')}`);

  const get = (params.get('get') || '').split(',').filter(Boolean);
  if (!get.length || get.length > 50 || !get.every((g) => VAR.test(g))) throw bad('invalid get= variable list (max 50)');

  const forGeo = params.get('for') || '';
  if (!FOR.test(forGeo)) throw bad('invalid for= geography');

  // Every request must be pinned to New York State, and to NYC counties when
  // a county is given.
  const ins = params.getAll('in');
  let state = null;
  for (const clause of ins.flatMap((s) => s.split(/\s+/))) {
    const [geo, val] = clause.split(':');
    if (geo === 'state') state = val;
    else if (geo === 'county') {
      if (!val || !val.split(',').every((c) => NYC_COUNTIES.has(c))) throw bad('county must be an NYC county (005,047,061,081,085)');
    } else if (geo !== 'tract') throw bad(`unsupported in= geography: ${geo}`);
  }
  if (forGeo.startsWith('zip code') ? state !== null : state !== '36') throw bad('requests must include in=state:36');

  const u = new URL(`https://api.census.gov/data/${year}/${dataset}`);
  u.searchParams.set('get', get.join(','));
  u.searchParams.set('for', forGeo);
  for (const i of ins) u.searchParams.append('in', i);
  return u;
}

export function OPTIONS(request) {
  return preflight(request);
}

export async function GET(request) {
  const cors = corsHeaders(request);
  if (!cors) return json({ error: 'Origin not allowed' }, { status: 403 });
  try {
    const url = buildUrl(new URL(request.url).searchParams);
    url.searchParams.set('key', requireKey());
    const res = await fetch(url, { headers: { 'User-Agent': 'mapping-nyc/1.0' } });
    const text = await res.text();
    if (!res.ok || text.trimStart().startsWith('<')) {
      return json({ error: `Census API ${res.status}`, detail: text.replace(/<[^>]+>/g, ' ').slice(0, 200).trim() }, { status: 502, headers: cors });
    }
    return new Response(text, {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800', ...cors },
    });
  } catch (err) {
    console.error('[census]', err.message);
    return json({ error: err.message }, { status: err.status || 500, headers: cors });
  }
}
