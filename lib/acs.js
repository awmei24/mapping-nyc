// Shared Census ACS pipeline: fetch tract-level estimates from the Census API,
// roll them up to NYC 2020 Neighborhood Tabulation Areas (NTAs), and compute the
// stats the site displays. Used by the Vercel function (api/neighborhoods.js)
// and the local build script (scripts/fetch_census.mjs).
//
// The API key is passed in by the caller and only ever used server-side.

export const NYC_STATE = '36';
export const NYC_COUNTIES = ['005', '047', '061', '081', '085']; // Bronx, Brooklyn, Manhattan, Queens, Staten Island
export const FIRST_YEAR = 2020; // 2016-2020 5-year: first release on 2020 census tracts (NTA 2020 is built from them)
export const DEFAULT_YEAR = 2024; // 2020-2024 5-year

const CENSUS = 'https://api.census.gov/data';
const MAX_VARS_PER_CALL = 48; // API cap is 50 incl. geography fields

// --------------------------------------------------------------------------- //
// Variables
// --------------------------------------------------------------------------- //
const pad = (n) => String(n).padStart(3, '0');
const r = (table, from, to = from) => {
  const out = [];
  for (let i = from; i <= to; i++) out.push(`${table}_${pad(i)}`);
  return out;
};
const v = (table, ...nums) => nums.map((n) => `${table}_${pad(n)}`);

export const BASE_VARIABLES = [
  ...r('B01001', 1, 49), // sex by age
  ...v('B03002', 1, 3, 4, 5, 6, 7, 8, 9, 12), // Hispanic origin by race
  ...r('B19001', 1, 17), // household income brackets
  ...v('B19313', 1), // aggregate income (per-capita numerator)
  ...r('B15003', 1, 25), // educational attainment 25+
  ...r('B25003', 1, 3), // tenure
  ...r('B25063', 1, 27), // gross rent brackets
  ...r('B25075', 1, 27), // home value brackets
  ...v('B25070', 1, 7, 8, 9, 10, 11), // rent as % of income
  ...v('B17001', 1, 2), // poverty
  ...v('B23025', 3, 5), // civilian labor force, unemployed
  ...v('B27010', 1, 17, 33, 50, 66), // health insurance
  ...v('B25044', 1, 3, 10), // vehicles available
  ...v('B08301', 1, 3, 4, 10, 19, 21), // means of transportation to work
  ...v('B08013', 1), // aggregate travel time to work
  ...v('B11001', 1, 8), // households, living alone
  ...v('B11003', 1, 3, 10, 16), // families with own children
  ...v('B25008', 1), // population in occupied housing units
  ...v('B21001', 1, 2), // veterans
  ...r('C16001', 1, 38), // language spoken at home
  ...v('B05002', 1, 13), // nativity
  ...r('B25034', 1, 11), // year structure built
  ...r('B25024', 1, 11), // units in structure
];

// Bins for interpolated medians: [codes summed into the bin, lower, upper|null]
const AGE_BINS = (() => {
  const bounds = [0, 5, 10, 15, 18, 20, 21, 22, 25, 30, 35, 40, 45, 50, 55, 60, 62, 65, 67, 70, 75, 80, 85, null];
  return bounds.slice(0, -1).map((lo, i) => [[`B01001_${pad(3 + i)}`, `B01001_${pad(27 + i)}`], lo, bounds[i + 1]]);
})();
const binsFrom = (table, firstLine, bounds) =>
  bounds.slice(0, -1).map((lo, i) => [[`${table}_${pad(firstLine + i)}`], lo, bounds[i + 1]]);
const INCOME_BINS = binsFrom('B19001', 2, [0, 10e3, 15e3, 20e3, 25e3, 30e3, 35e3, 40e3, 45e3, 50e3, 60e3, 75e3, 100e3, 125e3, 150e3, 200e3, null]);
const RENT_BINS = binsFrom('B25063', 3, [0, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 900, 1000, 1250, 1500, 2000, 2500, 3000, 3500, null]);
const VALUE_BINS = binsFrom('B25075', 2, [0, 10e3, 15e3, 20e3, 25e3, 30e3, 35e3, 40e3, 50e3, 60e3, 70e3, 80e3, 90e3, 100e3, 125e3, 150e3, 175e3, 200e3, 250e3, 300e3, 400e3, 500e3, 750e3, 1e6, 1.5e6, 2e6, null]);
export const MEDIAN_BINS = { AGE_BINS, INCOME_BINS, RENT_BINS, VALUE_BINS }; // exported for tests

// Distributions shown as bar charts. Must match the order/labels of the
// static pipeline (scripts/build_data.py DISTRIBUTIONS).
export const DISTRIBUTIONS = [
  ['ethnicity', 'Race & ethnicity', 'B03002_001', [
    ['Latino', v('B03002', 12)],
    ['White', v('B03002', 3)],
    ['Black', v('B03002', 4)],
    ['Asian', v('B03002', 6)],
    ['Other / multiracial', v('B03002', 5, 7, 8, 9)],
  ]],
  ['age', 'Age', 'B01001_001', [
    ['Under 10', [...v('B01001', 3, 4), ...v('B01001', 27, 28)]],
    ['10 to 19', [...r('B01001', 5, 7), ...r('B01001', 29, 31)]],
    ['20 to 34', [...r('B01001', 8, 12), ...r('B01001', 32, 36)]],
    ['35 to 49', [...r('B01001', 13, 15), ...r('B01001', 37, 39)]],
    ['50 to 64', [...r('B01001', 16, 19), ...r('B01001', 40, 43)]],
    ['65 and older', [...r('B01001', 20, 25), ...r('B01001', 44, 49)]],
  ]],
  ['income', 'Household income', 'B19001_001', [
    ['Under $25k', r('B19001', 2, 5)],
    ['$25k to $50k', r('B19001', 6, 10)],
    ['$50k to $75k', r('B19001', 11, 12)],
    ['$75k to $100k', v('B19001', 13)],
    ['$100k to $150k', r('B19001', 14, 15)],
    ['$150k to $200k', v('B19001', 16)],
    ['$200k or more', v('B19001', 17)],
  ]],
  ['education', 'Education (adults 25+)', 'B15003_001', [
    ['Less than high school', r('B15003', 2, 16)],
    ['High school diploma', r('B15003', 17, 18)],
    ["Some college / associate's", r('B15003', 19, 21)],
    ["Bachelor's degree", v('B15003', 22)],
    ['Graduate degree', r('B15003', 23, 25)],
  ]],
  ['commute', 'How people get to work', 'B08301_001', [
    ['Public transit', v('B08301', 10)],
    ['Drove alone', v('B08301', 3)],
    ['Carpooled', v('B08301', 4)],
    ['Walked', v('B08301', 19)],
    ['Worked from home', v('B08301', 21)],
    ['Other', null], // remainder
  ]],
  ['housing_age', 'When homes were built', 'B25034_001', [
    ['Before 1940', v('B25034', 11)],
    ['1940 to 1969', r('B25034', 8, 10)],
    ['1970 to 1999', r('B25034', 5, 7)],
    ['2000 to 2009', v('B25034', 4)],
    ['2010 or later', r('B25034', 2, 3)],
  ]],
  ['building_size', 'Homes by building size', 'B25024_001', [
    ['Single-family', r('B25024', 2, 3)],
    ['2 to 4 units', r('B25024', 4, 5)],
    ['5 to 19 units', r('B25024', 6, 7)],
    ['20 or more units', r('B25024', 8, 9)],
  ]],
];

const LANGUAGES = [
  ['Spanish', 'C16001_003'], ['French & Haitian Creole', 'C16001_006'],
  ['German & West Germanic', 'C16001_009'], ['Russian, Polish & other Slavic', 'C16001_012'],
  ['Other Indo-European', 'C16001_015'], ['Korean', 'C16001_018'], ['Chinese', 'C16001_021'],
  ['Vietnamese', 'C16001_024'], ['Tagalog', 'C16001_027'], ['Other Asian & Pacific', 'C16001_030'],
  ['Arabic', 'C16001_033'], ['Other languages', 'C16001_036'],
];
const LEP_CODES = [5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35, 38].map((n) => `C16001_${pad(n)}`);

// --------------------------------------------------------------------------- //
// Census API access
// --------------------------------------------------------------------------- //
export function validateYear(raw) {
  const y = Number(raw ?? DEFAULT_YEAR);
  const latest = Number(process.env.ACS_LATEST_YEAR || DEFAULT_YEAR);
  if (!Number.isInteger(y) || y < FIRST_YEAR || y > latest) {
    throw Object.assign(new Error(`year must be between ${FIRST_YEAR} and ${latest}`), { status: 400 });
  }
  return y;
}

async function censusGet(url, key, fetchImpl) {
  const u = new URL(url);
  if (key) u.searchParams.set('key', key);
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetchImpl(u, { headers: { 'User-Agent': 'mapping-nyc/1.0' } });
    if (res.status < 500) break;
    await new Promise((ok) => setTimeout(ok, 500 * (attempt + 1)));
  }
  const text = await res.text();
  if (!res.ok || text.trimStart().startsWith('<')) {
    // Never include the request URL (it carries the key) in errors.
    const hint = /key/i.test(text) ? ' (check CENSUS_API_KEY)' : '';
    throw Object.assign(new Error(`Census API ${res.status}${hint}: ${text.replace(/<[^>]+>/g, ' ').slice(0, 160).trim()}`), { status: 502 });
  }
  return JSON.parse(text);
}

async function pool(tasks, limit) {
  const out = new Array(tasks.length);
  let i = 0;
  const worker = async () => {
    while (i < tasks.length) {
      const idx = i++;
      out[idx] = await tasks[idx]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return out;
}

/** Country-of-birth variables (B05006) differ between vintages, so read the
 * group's labels and keep the leaf rows that are actual countries. */
export async function birthplaceVariables(year, key, fetchImpl = fetch) {
  const meta = await censusGet(`${CENSUS}/${year}/acs/acs5/groups/B05006.json`, key, fetchImpl);
  const labels = {};
  for (const [name, info] of Object.entries(meta.variables || {})) {
    if (/^B05006_\d{3}E$/.test(name)) labels[name.slice(0, -1)] = info.label.replace(/^Estimate!!Total:?!!/, '');
  }
  const paths = Object.entries(labels).map(([code, label]) => [code, label.replace(/:/g, '')]);
  const leaves = paths.filter(([, p]) => !paths.some(([, q]) => q !== p && q.startsWith(p + '!!')));
  const out = {};
  for (const [code, p] of leaves) {
    let name = p.split('!!').pop().trim();
    if (/^(Other|.*n\.e\.c\.)/i.test(name) || name.startsWith('Estimate')) continue;
    name = name.replace(/, excluding Hong Kong and Taiwan/i, '').replace(/\s*\(.*?\)\s*$/, '').trim();
    out[code] = name;
  }
  return out;
}

/** Fetch every variable for every NYC tract. Returns Map(geoid -> {code: number}). */
export async function fetchTracts({ year, key, variables, fetchImpl = fetch, concurrency = 8 }) {
  const chunks = [];
  for (let i = 0; i < variables.length; i += MAX_VARS_PER_CALL) chunks.push(variables.slice(i, i + MAX_VARS_PER_CALL));
  const tasks = [];
  for (const county of NYC_COUNTIES) {
    for (const chunk of chunks) {
      const url = `${CENSUS}/${year}/acs/acs5?get=${chunk.map((c) => c + 'E').join(',')}` +
        `&for=tract:*&in=state:${NYC_STATE}&in=county:${county}`;
      tasks.push(() => censusGet(url, key, fetchImpl));
    }
  }
  const results = await pool(tasks, concurrency);
  const tracts = new Map();
  for (const rows of results) {
    const [header, ...data] = rows;
    const iState = header.indexOf('state'), iCounty = header.indexOf('county'), iTract = header.indexOf('tract');
    for (const row of data) {
      const geoid = row[iState] + row[iCounty] + row[iTract];
      const rec = tracts.get(geoid) || {};
      header.forEach((h, j) => {
        if (/E$/.test(h) && h !== 'NAME') {
          const n = Number(row[j]);
          rec[h.slice(0, -1)] = Number.isFinite(n) && n >= 0 ? n : 0; // negative = Census sentinel
        }
      });
      tracts.set(geoid, rec);
    }
  }
  return tracts;
}

// --------------------------------------------------------------------------- //
// Stats
// --------------------------------------------------------------------------- //
const sum = (row, codes) => codes.reduce((s, c) => s + (row[c] || 0), 0);
const ratio = (a, b) => (b ? a / b : null);

export function interpMedian(row, bins) {
  const counts = bins.map(([codes]) => sum(row, codes));
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const half = total / 2;
  let run = 0;
  for (let i = 0; i < bins.length; i++) {
    const c = counts[i];
    if (c > 0 && run + c >= half) {
      const [, lo, hi] = bins[i];
      return hi == null ? lo : lo + ((half - run) / c) * (hi - lo);
    }
    run += c;
  }
  return null;
}

export function computeStats(row, area) {
  const g = (c) => row[c] || 0;
  const pop = g('B01001_001');
  const pop2 = g('B03002_001');
  let diversity = null;
  if (pop2) {
    const groups = [g('B03002_012'), g('B03002_003'), g('B03002_004'), g('B03002_006')];
    groups.push(Math.max(pop2 - groups.reduce((a, b) => a + b, 0), 0));
    diversity = 1 - groups.reduce((s, x) => s + (x / pop2) ** 2, 0);
  }
  const workers = g('B08301_001');
  const under18 = sum(row, [...r('B01001', 3, 6), ...r('B01001', 27, 30)]);
  const over65 = sum(row, [...r('B01001', 20, 25), ...r('B01001', 44, 49)]);
  const bachPlus = sum(row, r('B15003', 22, 25));
  return {
    population: pop,
    area_sqmi: area,
    density: area ? pop / area : null,
    median_age: interpMedian(row, AGE_BINS),
    median_income: interpMedian(row, INCOME_BINS),
    per_capita_income: ratio(g('B19313_001'), pop),
    diversity,
    pct_latino: ratio(g('B03002_012'), pop2),
    pct_white: ratio(g('B03002_003'), pop2),
    pct_black: ratio(g('B03002_004'), pop2),
    pct_asian: ratio(g('B03002_006'), pop2),
    pct_foreign_born: ratio(g('B05002_013'), g('B05002_001')),
    pct_bachelors: ratio(bachPlus, g('B15003_001')),
    pct_renters: ratio(g('B25003_003'), g('B25003_001')),
    median_rent: interpMedian(row, RENT_BINS),
    median_home_value: interpMedian(row, VALUE_BINS),
    pct_rent_burdened: ratio(sum(row, r('B25070', 7, 10)), g('B25070_001') - g('B25070_011')),
    pct_poverty: ratio(g('B17001_002'), g('B17001_001')),
    pct_unemployed: ratio(g('B23025_005'), g('B23025_003')),
    pct_no_insurance: ratio(sum(row, v('B27010', 17, 33, 50, 66)), g('B27010_001')),
    pct_no_car: ratio(g('B25044_003') + g('B25044_010'), g('B25044_001')),
    pct_transit: ratio(g('B08301_010'), workers),
    pct_wfh: ratio(g('B08301_021'), workers),
    commute_min: ratio(g('B08013_001'), workers - g('B08301_021')),
    avg_hh_size: ratio(g('B25008_001'), g('B25003_001')),
    pct_living_alone: ratio(g('B11001_008'), g('B11001_001')),
    pct_single_parent: ratio(g('B11003_010') + g('B11003_016'), sum(row, v('B11003', 3, 10, 16))),
    pct_under18: ratio(under18, pop),
    pct_65plus: ratio(over65, pop),
    pct_veterans: ratio(g('B21001_002'), g('B21001_001')),
    pct_limited_english: ratio(sum(row, LEP_CODES), g('C16001_001')),
    pct_pre1940: ratio(g('B25034_011'), g('B25034_001')),
  };
}

function roundStats(s) {
  const out = {};
  for (const [k, val] of Object.entries(s)) {
    if (k.startsWith('_')) continue;
    if (val == null || !Number.isFinite(val)) out[k] = null;
    else if (k.startsWith('pct_') || k === 'diversity') out[k] = Math.round(val * 1e4) / 1e4;
    else if (['area_sqmi', 'avg_hh_size', 'median_age', 'commute_min'].includes(k)) out[k] = Math.round(val * 100) / 100;
    else out[k] = Math.round(val);
  }
  return out;
}

function distributions(row) {
  const out = {};
  for (const [key, , universe, groups] of DISTRIBUTIONS) {
    const tot = row[universe];
    if (!tot) continue;
    let used = 0;
    out[key] = groups.map(([, codes]) => {
      const n = codes ? sum(row, codes) : tot - used;
      used += codes ? n : 0;
      return Math.round((Math.max(n, 0) / tot) * 1e4) / 1e4;
    });
  }
  return out;
}

function birthplaces(row, bpNames, top = 6) {
  const fb = row.B05002_013;
  if (!fb) return [];
  return Object.entries(bpNames)
    .map(([code, name]) => [name, row[code] || 0])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([name, n]) => [name, Math.round(n), Math.round((n / fb) * 1e4) / 1e4]);
}

function languages(row) {
  const pop5 = row.C16001_001;
  if (!pop5) return [];
  const langs = LANGUAGES.map(([n, c]) => [n, row[c] || 0]).filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return [['English only', (row.C16001_002 || 0) / pop5], ...langs.map(([n, x]) => [n, x / pop5])]
    .map(([n, x]) => [n, Math.round(x * 1e4) / 1e4]);
}

function sumRows(rows) {
  const out = {};
  for (const row of rows) for (const [k, val] of Object.entries(row)) out[k] = (out[k] || 0) + val;
  return out;
}

function summarize(row, area, bpNames) {
  return {
    stats: roundStats(computeStats(row, area)),
    dist: distributions(row),
    birthplaces: birthplaces(row, bpNames),
    languages: languages(row),
  };
}

/**
 * Roll tracts up to NTAs/boroughs/city and compute everything the site shows.
 * `index` is data/nta_index.json from scripts/build_data.py.
 */
export function aggregate(tracts, index, bpNames, year) {
  const byNta = {};
  let unmatched = 0;
  for (const [geoid, row] of tracts) {
    const nta = index.tracts[geoid];
    if (!nta) { unmatched++; continue; }
    (byNta[nta] ||= []).push(row);
  }
  const ntaRows = {};
  const neighborhoods = {};
  for (const [code, [borough, residential, area]] of Object.entries(index.ntas)) {
    const row = sumRows(byNta[code] || []);
    ntaRows[code] = row;
    const s = summarize(row, area, bpNames);
    if (!s.stats.population) { s.dist = {}; s.birthplaces = []; s.languages = []; }
    neighborhoods[code] = { ...s, rank: {}, brank: {}, _borough: borough, _res: !!residential };
  }

  // Ranks among residential neighborhoods (1 = highest value)
  const keys = Object.keys(Object.values(neighborhoods)[0].stats);
  const res = Object.keys(neighborhoods).filter((c) => neighborhoods[c]._res);
  const rank_n = {}, brank_n = Object.fromEntries(index.boroughs.map((b) => [b, {}]));
  for (const k of keys) {
    const vals = res.filter((c) => neighborhoods[c].stats[k] != null).sort((a, b) => neighborhoods[b].stats[k] - neighborhoods[a].stats[k]);
    vals.forEach((c, i) => { neighborhoods[c].rank[k] = i + 1; });
    rank_n[k] = vals.length;
    for (const b of index.boroughs) {
      const bv = vals.filter((c) => neighborhoods[c]._borough === b);
      bv.forEach((c, i) => { neighborhoods[c].brank[k] = i + 1; });
      brank_n[b][k] = bv.length;
    }
  }

  const boroughs = {};
  for (const b of index.boroughs) {
    const members = Object.keys(index.ntas).filter((c) => index.ntas[c][0] === b);
    const area = members.reduce((s, c) => s + index.ntas[c][2], 0);
    boroughs[b] = summarize(sumRows(members.map((c) => ntaRows[c])), area, bpNames);
  }
  const cityArea = Object.values(index.ntas).reduce((s, n) => s + n[2], 0);
  const city = { name: 'New York City', ...summarize(sumRows(Object.values(ntaRows)), cityArea, bpNames) };

  for (const n of Object.values(neighborhoods)) { delete n._borough; delete n._res; }

  return {
    meta: {
      acs: `American Community Survey ${year - 4}-${year} 5-year estimates`,
      acs_source: 'US Census Bureau API, aggregated from 2020 census tracts',
      year,
      generated: new Date().toISOString(),
      medians: 'Neighborhood, borough and city medians are interpolated from published brackets.',
      dist_labels: Object.fromEntries(DISTRIBUTIONS.map(([k, t, , groups]) => [k, { title: t, labels: groups.map((x) => x[0]) }])),
      rank_n,
      brank_n,
      unmatched_tracts: unmatched,
    },
    city,
    boroughs,
    neighborhoods,
  };
}

/** One call that does everything. */
export async function buildNeighborhoodStats({ year, key, index, fetchImpl = fetch }) {
  const bpNames = await birthplaceVariables(year, key, fetchImpl);
  const variables = [...BASE_VARIABLES, 'B05006_001', ...Object.keys(bpNames)];
  const tracts = await fetchTracts({ year, key, variables: [...new Set(variables)], fetchImpl });
  return aggregate(tracts, index, bpNames, year);
}
