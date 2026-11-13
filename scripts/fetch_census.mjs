#!/usr/bin/env node
// Pull the latest ACS data through the Census API with your local key and
// write it to data/acs_<year>.json — the same shape /api/neighborhoods returns.
//
// Use this if you'd rather publish a static snapshot (no Vercel needed):
//   CENSUS_API_KEY=... npm run fetch-census -- --year 2024
// then set liveStatsUrl in config.js to "data/acs_2024.json".

import { readFile, writeFile } from 'node:fs/promises';
import { buildNeighborhoodStats, validateYear } from '../lib/acs.js';

const args = process.argv.slice(2);
const yearArg = args.includes('--year') ? args[args.indexOf('--year') + 1] : undefined;
const key = process.env.CENSUS_API_KEY;
if (!key) {
  console.error('Set CENSUS_API_KEY (in .env or the environment). Free key: https://api.census.gov/data/key_signup.html');
  process.exit(1);
}
const year = validateYear(yearArg);
const root = new URL('../', import.meta.url);
const index = JSON.parse(await readFile(new URL('data/nta_index.json', root), 'utf8'));

console.log(`Fetching ACS ${year - 4}-${year} 5-year tract data for NYC…`);
const t0 = Date.now();
const data = await buildNeighborhoodStats({ year, key, index });
const out = new URL(`data/acs_${year}.json`, root);
await writeFile(out, JSON.stringify(data));
console.log(`Wrote ${out.pathname} in ${((Date.now() - t0) / 1000).toFixed(1)}s` +
  (data.meta.unmatched_tracts ? ` (${data.meta.unmatched_tracts} tracts not matched to a neighborhood)` : ''));
console.log(`Citywide: population ${data.city.stats.population.toLocaleString()}, median household income $${data.city.stats.median_income.toLocaleString()}`);
