// Site configuration. This file is public — never put an API key here.
window.MAPPING_NYC_CONFIG = {
  // Optional source of fresher Census stats. Leave empty to use only the bundled
  // NYC Planning data in data/stats.json. Either:
  //   * your Vercel API (keeps the Census key server-side), e.g.
  //       'https://mapping-nyc.vercel.app/api/neighborhoods?year=2024'
  //     or '/api/neighborhoods?year=2024' if the whole site is hosted on Vercel
  //   * a snapshot made with `npm run fetch-census`, e.g. 'data/acs_2024.json'
  liveStatsUrl: '',
};
