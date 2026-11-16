# Mapping NYC

**[awmei24.github.io/mapping-nyc](https://awmei24.github.io/mapping-nyc/)**

An interactive guide to New York City's neighborhoods, inspired by the Los Angeles Times' *Mapping L.A.*

Explore all 262 of the city's neighborhood areas on one map. Each has a profile showing who lives there, what
they earn, how they live and how they get around, along with how it compares with its borough and with the rest
of the city.

## What you can do

- **Browse the map.** Shade the city by any of 30+ measures, from median rent to the share of residents who work
  from home, and hover over a neighborhood to see its value.
- **Read a neighborhood profile.** Each one includes:
  - key figures and what stands out
  - breakdowns by age, race and ethnicity, income, education, commute and housing stock
  - top countries of birth and languages spoken at home
  - the neighborhoods next door
- **See the rankings.** Sort the city's 197 residential neighborhoods by any measure, either citywide or within one
  borough.
- **Compare boroughs.** Borough pages show how the Bronx, Brooklyn, Manhattan, Queens and Staten Island stack up.

Every view has its own link. For example, [Greenpoint](https://awmei24.github.io/mapping-nyc/#/neighborhood/greenpoint),
[Queens](https://awmei24.github.io/mapping-nyc/#/borough/queens) and
[Brooklyn rents](https://awmei24.github.io/mapping-nyc/#/rankings/median_rent/brooklyn).

## About the data

| | Source |
|---|---|
| Neighborhood boundaries | [2020 Neighborhood Tabulation Areas](https://data.cityofnewyork.us/d/9nt8-h7nd), NYC Department of City Planning |
| Neighborhood statistics | American Community Survey 2020–2024 5-year estimates, U.S. Census Bureau, tract level |
| Fallback statistics | American Community Survey 2018–2022 5-year estimates by neighborhood, NYC Planning Population Division |
| Surrounding land | U.S. Census Bureau cartographic boundary files (1:500k counties) |

**How the numbers are calculated**

- **Totals and percentages.** NYC Planning builds its neighborhood areas from whole 2020 census tracts, so tract
  counts add up exactly to each neighborhood.
- **Medians.** Medians can't simply be added up across tracts. Neighborhood medians are estimated by linear
  interpolation within the Census Bureau's published brackets. Values in the open top bracket appear as
  "$200,000+", "$3,500+" or "$2,000,000+".
- **Diversity index.** The chance that two randomly chosen residents belong to different groups: Latino, white,
  Black, Asian, or another group.
- **Rankings.** Only residential neighborhoods are ranked, which leaves out parks, cemeteries, airports and Rikers
  Island. Rank 1 is the highest value.

**Caveats**

- These are survey estimates with margins of error, so small differences between neighborhoods may not be
  meaningful.
- Five-year estimates describe the whole period they cover, not a single year.

## Running your own copy

The site is plain HTML, CSS and JavaScript with [Leaflet](https://leafletjs.com). It has no build step and works
on any static host.

```sh
python3 -m http.server 8000      # then open http://localhost:8000
```

To publish it on GitHub Pages, fork the repo and go to **Settings → Pages → Deploy from a branch → `main` / root**.
All paths are relative, so it works at `https://<user>.github.io/<repo>/`.

### Rebuilding the bundled data

This step needs no API key. It downloads the boundaries and NYC Planning tables and writes them to `data/`:

```sh
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/build_data.py
npm run build-context            # land around the city, for the map background
```

### Refreshing the Census numbers

Newer figures come from the Census API, which needs a free key
([sign up here](https://api.census.gov/data/key_signup.html)). The key must never end up in the website. You can
use it in one of two ways:

**Option 1: a snapshot.** This is the simplest. Pull the data once on your machine and commit the resulting JSON
file:

```sh
cp .env.example .env                      # add CENSUS_API_KEY; .env is git-ignored
npm run fetch-census -- --year 2024       # writes data/acs_2024.json
```

Then set `liveStatsUrl: 'data/acs_2024.json'` in `config.js`.

**Option 2: a serverless API.** The functions in `api/` run on Vercel and keep the key on the server. The browser
calls the function, the function calls api.census.gov with the key, and Vercel's CDN caches the response for a day.

```sh
vercel link
vercel env add CENSUS_API_KEY
vercel env add ALLOWED_ORIGINS            # e.g. https://<user>.github.io,http://localhost:8000
vercel --prod
```

Then set `liveStatsUrl: 'https://<project>.vercel.app/api/neighborhoods?year=2024'` in `config.js`. The site shows
the bundled data right away and swaps in the API data when it arrives.

The API protects the key in several ways:

- It accepts only allowlisted years, datasets and NYC geographies, and at most 50 variables per request.
- It removes request URLs from error messages, so the key can't leak into a response.
- It limits browser calls to `ALLOWED_ORIGINS`. For extra protection, turn on Vercel's Firewall rate limiting for
  `/api/*`.

The Census Bureau usually publishes a new 5-year release in December. When it does, set `ACS_LATEST_YEAR` and
update the year in `config.js`.

### Tests

```sh
npm test
```

The tests run the data pipeline and both API functions against a fake Census API, so they need no key or network.

### Project layout

```
index.html, config.js, assets/   the website
data/                            data the site loads (boundaries, stats, tract lookup)
api/                             Vercel functions: /api/neighborhoods and /api/census
lib/acs.js                       Census pipeline shared by the API and the snapshot script
scripts/                         data build and fetch scripts
test/                            offline tests
```

## Credits

Inspired by the Los Angeles Times' [Mapping L.A.](https://maps.latimes.com/neighborhoods/). This is an independent
project, not affiliated with the Times. Data comes from the U.S. Census Bureau and the NYC Department of City
Planning.
