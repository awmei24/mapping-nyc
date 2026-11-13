# Mapping NYC

Neighborhood profiles for New York City, in the spirit of the Los Angeles Times' *Mapping L.A.*
An interactive map of the city's 262 neighborhood areas, with a profile page for each one: demographics, income,
housing, commuting, birthplaces and languages. Each neighborhood is also ranked against the city's 197
residential neighborhoods.

It's a static site (plain HTML/CSS/JS + [Leaflet](https://leafletjs.com)) that runs on GitHub Pages. There's also
an optional Vercel API that pulls fresh Census data with your API key, without exposing the key.

```
index.html, config.js, assets/   the website
data/                            generated data the site loads
  neighborhoods.geojson          simplified 2020 NTA boundaries + borough outlines
  stats.json                     bundled stats (NYC Planning ACS 2018–2022), ranks, neighbors
  nta_index.json                 census tract → neighborhood lookup used by the API
api/                             Vercel serverless functions (hold the Census key)
  neighborhoods.js               GET /api/neighborhoods?year=2024 → stats in the same shape as stats.json
  census.js                      GET /api/census?...  allowlisted pass-through for ad-hoc NYC queries
lib/acs.js                       Census pipeline shared by the API and the local script
scripts/build_data.py            builds data/ from NYC Open Data + NYC Planning (no key needed)
scripts/fetch_census.mjs         pulls Census API data locally with your key → data/acs_<year>.json
test/                            offline tests (fake Census API)
```

## Run it locally

```sh
python3 -m http.server 8000      # then open http://localhost:8000
```

Pages are hash-routed (`#/neighborhood/greenpoint`, `#/borough/queens`, `#/rankings/median_rent/brooklyn`), so
every view can be linked to and works on GitHub Pages without extra config.

## Where the data comes from

| | Source |
|---|---|
| Boundaries | [2020 Neighborhood Tabulation Areas](https://data.cityofnewyork.us/d/9nt8-h7nd), NYC Dept. of City Planning |
| Bundled stats | ACS 2018–2022 5-year estimates by NTA, NYC Planning Population Division |
| Live stats (optional) | U.S. Census Bureau ACS 5-year API, tract-level, summed into NTAs |

NTAs are built from whole 2020 census tracts, so tract data adds up exactly to neighborhoods. Medians can't be
added up, so the API pipeline estimates them by linear interpolation within published brackets. Values in an open
top bracket show as "$200,000+", "$3,500+" or "$2,000,000+". The *diversity index* is the probability that two
random residents belong to different groups (Latino, white, Black, Asian, other).

To rebuild the bundled data:

```sh
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/build_data.py
```

## Using the Census API without exposing your key

The key never goes into the website. The browser calls **your** Vercel function, the function adds the key on the
server and calls api.census.gov, and the result is cached on Vercel's CDN for a day.

```
browser ──► https://<project>.vercel.app/api/neighborhoods?year=2024 ──► api.census.gov (+ key)
             (CORS: only your site)       (cached 24h on the CDN)
```

### 1. Get a key
Free: <https://api.census.gov/data/key_signup.html>

### 2. Deploy the API to Vercel
```sh
npm i -g vercel
vercel link                                   # create/link a project
vercel env add CENSUS_API_KEY                 # paste the key; pick Production (+ Preview/Development if you like)
vercel env add ALLOWED_ORIGINS                # e.g. https://YOUR-USERNAME.github.io,http://localhost:8000
vercel --prod
```
Check it: `curl https://<project>.vercel.app/api/neighborhoods?year=2024 | head -c 300`.
The first call takes ~10–20s while it pulls ~2,300 tracts. Later calls come from the cache.

### 3. Point the site at it
In `config.js`:
```js
liveStatsUrl: 'https://<project>.vercel.app/api/neighborhoods?year=2024',
```
The site loads the bundled data right away, swaps in the live numbers when they arrive, and quietly keeps the
bundled data if the API is down.

**Hosting everything on Vercel instead:** the same deploy also serves the static site, so you can use
`liveStatsUrl: '/api/neighborhoods?year=2024'` and skip GitHub Pages entirely.

### Local development with the key
```sh
cp .env.example .env        # fill in CENSUS_API_KEY; .env is git-ignored
vercel dev                  # site + API at http://localhost:3000
```

### No-server option: a snapshot
If you'd rather not run an API at all, pull the data once and commit the result:
```sh
npm run fetch-census -- --year 2024     # reads CENSUS_API_KEY from .env → data/acs_2024.json
```
Then set `liveStatsUrl: 'data/acs_2024.json'`. The key stays on your machine.

### What protects the key
- It lives only in Vercel env vars or your git-ignored `.env`, never in `config.js` or the repo.
- Errors from the Census API are passed through without the request URL, so the key can't leak into responses.
- `/api/neighborhoods` only accepts a `year` in an allowlisted range (`ACS_LATEST_YEAR` caps it).
- `/api/census` only allows a few datasets, at most 50 variables, and NYC geographies (state 36, the five
  borough counties), so nobody can use your key for arbitrary queries.
- CORS limits browser calls to `ALLOWED_ORIGINS`. CORS doesn't stop `curl`, but anyone calling directly just gets
  public, CDN-cached data. For extra protection, turn on Vercel's Firewall rate limiting for `/api/*`.

When the Census Bureau publishes a new 5-year release (usually in December), set `ACS_LATEST_YEAR` in Vercel and
bump the year in `config.js`.

## Publish on GitHub Pages
Push the repo, then **Settings → Pages → Deploy from a branch → `main` / root**. All paths are relative, so it
works at `https://<user>.github.io/<repo>/`.

## Tests
```sh
npm test
```
Runs the pipeline and both API functions against a fake Census API, with no key or network needed.

## Credits & caveats
Inspired by the Los Angeles Times' Mapping L.A. This is an independent project, not affiliated with the Times.
ACS figures are survey estimates with margins of error, so small differences between neighborhoods may not be
meaningful.
