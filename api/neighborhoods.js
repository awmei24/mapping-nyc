// GET /api/neighborhoods?year=2024
//
// Pulls tract-level ACS 5-year data from the Census API using the server-side
// CENSUS_API_KEY, rolls it up to NYC neighborhoods and returns the stats the
// site displays. Responses are cached on Vercel's CDN for a day, so the Census
// API is hit roughly once per day per year requested.

import { readFile } from 'node:fs/promises';
import { buildNeighborhoodStats, validateYear } from '../lib/acs.js';
import { corsHeaders, json, preflight, requireKey } from '../lib/http.js';

const DAY = 86400;
let indexPromise;
const memo = new Map(); // per-instance cache: year -> { at, data }

function loadIndex() {
  indexPromise ||= readFile(new URL('../data/nta_index.json', import.meta.url), 'utf8').then(JSON.parse);
  return indexPromise;
}

export function OPTIONS(request) {
  return preflight(request);
}

export async function GET(request) {
  const cors = corsHeaders(request);
  if (!cors) return json({ error: 'Origin not allowed' }, { status: 403 });
  try {
    const year = validateYear(new URL(request.url).searchParams.get('year') ?? undefined);
    const hit = memo.get(year);
    if (hit && Date.now() - hit.at < DAY * 1000) {
      return json(hit.data, { headers: cors, cacheSeconds: DAY });
    }
    const data = await buildNeighborhoodStats({ year, key: requireKey(), index: await loadIndex() });
    memo.set(year, { at: Date.now(), data });
    return json(data, { headers: cors, cacheSeconds: DAY });
  } catch (err) {
    console.error('[neighborhoods]', err.message);
    return json({ error: err.message }, { status: err.status || 500, headers: cors });
  }
}
