// Offline tests for the Census pipeline and API functions. A fake Census API
// stands in for api.census.gov, so these run without a key or network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aggregate, buildNeighborhoodStats, interpMedian, MEDIAN_BINS } from '../lib/acs.js';

const index = JSON.parse(readFileSync(new URL('../data/nta_index.json', import.meta.url), 'utf8'));
const KEY = 'test-secret-key-123';

// Deterministic pseudo-random value per (tract, variable)
function val(geoid, code) {
  let h = 0;
  for (const ch of geoid + code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 10 + (h % 500);
}

function fakeCensus({ calls = [] } = {}) {
  return async (url) => {
    const u = new URL(url);
    calls.push(u);
    if (u.searchParams.get('key') !== KEY) return new Response('<html><title>Invalid Key</title></html>', { status: 200 });
    if (u.pathname.endsWith('/groups/B05006.json')) {
      return Response.json({
        variables: {
          B05006_001E: { label: 'Estimate!!Total:' },
          B05006_002E: { label: 'Estimate!!Total:!!Europe:' },
          B05006_003E: { label: 'Estimate!!Total:!!Europe:!!Poland' },
          B05006_004E: { label: 'Estimate!!Total:!!Europe:!!Other Europe' },
          B05006_005E: { label: 'Estimate!!Total:!!Asia:!!China:' },
          B05006_006E: { label: 'Estimate!!Total:!!Asia:!!China:!!China, excluding Hong Kong and Taiwan' },
          B05006_007E: { label: 'Estimate!!Total:!!Asia:!!China:!!Hong Kong' },
          B05006_008E: { label: 'Estimate!!Total:!!Americas:!!Latin America:!!Caribbean:!!Dominican Republic' },
        },
      });
    }
    const get = u.searchParams.get('get').split(',');
    const county = u.searchParams.getAll('in').find((s) => s.startsWith('county:')).split(':')[1];
    const tracts = Object.keys(index.tracts).filter((g) => g.slice(2, 5) === county);
    const rows = [[...get, 'state', 'county', 'tract'], ...tracts.map((g) => [...get.map((c) => String(val(g, c))), '36', county, g.slice(5)])];
    return Response.json(rows);
  };
}

test('interpolated median lands inside the right bracket', () => {
  const row = { B19001_002: 10, B19001_003: 10, B19001_004: 10, B19001_013: 70 }; // half=50 falls in $75k-$100k
  const m = interpMedian(row, MEDIAN_BINS.INCOME_BINS);
  assert.ok(m > 75000 && m < 100000, `got ${m}`);
});

test('full pipeline: key is sent, every NTA gets stats, ranks are consistent', async () => {
  const calls = [];
  const data = await buildNeighborhoodStats({ year: 2024, key: KEY, index, fetchImpl: fakeCensus({ calls }) });
  assert.ok(calls.every((u) => u.searchParams.get('key') === KEY));
  assert.ok(calls.every((u) => u.searchParams.get('get') === null || u.searchParams.get('get').split(',').length <= 50));
  assert.equal(Object.keys(data.neighborhoods).length, Object.keys(index.ntas).length);
  assert.equal(data.meta.unmatched_tracts, 0);

  const res = Object.entries(index.ntas).filter(([, n]) => n[1]).map(([c]) => c);
  assert.equal(data.meta.rank_n.population, res.length);
  const ranks = res.map((c) => data.neighborhoods[c].rank.population).sort((a, b) => a - b);
  assert.deepEqual(ranks, res.map((_, i) => i + 1));

  const city = data.city.stats;
  // (random fake data: subgroups needn't sum to totals, so only check types/ranges loosely)
  assert.ok(city.population > 0 && city.median_income > 0 && city.median_age > 0 && city.median_rent > 0);
  assert.equal(typeof city.diversity, 'number');
  for (const [k, shares] of Object.entries(data.city.dist)) {
    assert.equal(shares.length, data.meta.dist_labels[k].labels.length);
    assert.ok(shares.every((s) => typeof s === 'number' && s >= 0), k);
  }
  // birthplaces: leaves only, "Other …" dropped, China label cleaned
  const names = data.city.birthplaces.map((b) => b[0]);
  assert.ok(names.includes('China') && names.includes('Poland') && names.includes('Dominican Republic'));
  assert.ok(!names.some((n) => /Other|Europe|excluding|Total/.test(n)));
});

test('bad key surfaces a clear error without leaking the key', async () => {
  await assert.rejects(
    buildNeighborhoodStats({ year: 2024, key: 'wrong', index, fetchImpl: fakeCensus() }),
    (err) => /CENSUS_API_KEY/.test(err.message) && !err.message.includes('wrong'),
  );
});

test('aggregate tolerates tracts missing from the index', () => {
  const tracts = new Map([['99999999999', { B01001_001: 5 }]]);
  const out = aggregate(tracts, index, {}, 2024);
  assert.equal(out.meta.unmatched_tracts, 1);
});

// ---- API handlers --------------------------------------------------------- //
async function withEnv(env, fn) {
  const saved = { ...process.env };
  const savedFetch = globalThis.fetch;
  Object.assign(process.env, env);
  globalThis.fetch = fakeCensus();
  try { return await fn(); } finally { process.env = saved; globalThis.fetch = savedFetch; }
}

test('/api/neighborhoods: CORS allowlist, caching, year validation, no key in body', async () => {
  await withEnv({ CENSUS_API_KEY: KEY, ALLOWED_ORIGINS: 'https://me.github.io' }, async () => {
    const { GET } = await import('../api/neighborhoods.js');
    const ok = await GET(new Request('https://x.vercel.app/api/neighborhoods?year=2024', { headers: { origin: 'https://me.github.io' } }));
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://me.github.io');
    assert.match(ok.headers.get('cache-control'), /s-maxage=86400/);
    const body = await ok.text();
    assert.ok(!body.includes(KEY));

    const blocked = await GET(new Request('https://x.vercel.app/api/neighborhoods', { headers: { origin: 'https://evil.example' } }));
    assert.equal(blocked.status, 403);

    const badYear = await GET(new Request('https://x.vercel.app/api/neighborhoods?year=1999'));
    assert.equal(badYear.status, 400);
  });
});

test('/api/census: only NYC geographies and allowed datasets', async () => {
  await withEnv({ CENSUS_API_KEY: KEY, ALLOWED_ORIGINS: '' }, async () => {
    const { GET } = await import('../api/census.js');
    const call = (qs) => GET(new Request(`https://x.vercel.app/api/census?${qs}`));
    assert.equal((await call('year=2024&get=B01003_001E&for=tract:*&in=state:36&in=county:061')).status, 200);
    assert.equal((await call('year=2024&get=B01003_001E&for=tract:*&in=state:06&in=county:037')).status, 400);
    assert.equal((await call('year=2024&get=B01003_001E&for=tract:*&in=state:36&in=county:001')).status, 400);
    assert.equal((await call('year=2024&dataset=timeseries/foo&get=B01003_001E&for=county:061&in=state:36')).status, 400);
    assert.equal((await call('year=2024&get=DROP%20TABLE&for=county:061&in=state:36')).status, 400);
  });
});
