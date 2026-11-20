/* MappingNYC — single-page app (hash routing, works on GitHub Pages). */
(() => {
  'use strict';

  const CONFIG = window.MAPPING_NYC_CONFIG || {};
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ------------------------------------------------------------------------ //
  // Stat definitions
  // ------------------------------------------------------------------------ //
  // fmt: int | usd | pct | dec1 | dec2 | idx | min | area | dens
  // hl: phrase for highlights ("highest ___"); omit to exclude from highlights
  const STATS = [
    { group: 'People', key: 'population', label: 'Population', fmt: 'int', hl: 'population' },
    { group: 'People', key: 'density', label: 'People per sq. mile', fmt: 'int', hl: 'population density' },
    { group: 'People', key: 'area_sqmi', label: 'Area', fmt: 'area', nomap: true },
    { group: 'People', key: 'median_age', label: 'Median age', fmt: 'dec1', hl: 'median age' },
    { group: 'People', key: 'pct_under18', label: 'Under 18', fmt: 'pct', hl: 'share of children' },
    { group: 'People', key: 'pct_65plus', label: '65 and older', fmt: 'pct', hl: 'share of seniors' },
    { group: 'People', key: 'diversity', label: 'Diversity index', fmt: 'idx', hl: 'diversity' },
    { group: 'People', key: 'pct_latino', label: 'Latino', fmt: 'pct', hl: 'share of Latino residents' },
    { group: 'People', key: 'pct_white', label: 'White', fmt: 'pct', hl: 'share of white residents' },
    { group: 'People', key: 'pct_black', label: 'Black', fmt: 'pct', hl: 'share of Black residents' },
    { group: 'People', key: 'pct_asian', label: 'Asian', fmt: 'pct', hl: 'share of Asian residents' },
    { group: 'People', key: 'pct_foreign_born', label: 'Born outside the U.S.', fmt: 'pct', hl: 'share of foreign-born residents' },
    { group: 'People', key: 'pct_limited_english', label: 'Limited English', fmt: 'pct', hl: 'share of residents with limited English' },
    { group: 'People', key: 'pct_veterans', label: 'Veterans (adults)', fmt: 'pct', hl: 'share of veterans' },
    { group: 'Money & work', key: 'median_income', label: 'Median household income', fmt: 'usd', hl: 'median household income' },
    { group: 'Money & work', key: 'per_capita_income', label: 'Income per person', fmt: 'usd', hl: 'income per person' },
    { group: 'Money & work', key: 'pct_poverty', label: 'Below poverty line', fmt: 'pct', hl: 'poverty rate' },
    { group: 'Money & work', key: 'pct_unemployed', label: 'Unemployment rate', fmt: 'pct', hl: 'unemployment rate' },
    { group: 'Money & work', key: 'pct_bachelors', label: "Bachelor's degree or higher", fmt: 'pct', hl: 'share of college graduates' },
    { group: 'Money & work', key: 'pct_no_insurance', label: 'No health insurance', fmt: 'pct', hl: 'share without health insurance' },
    { group: 'Housing', key: 'pct_renters', label: 'Renters', fmt: 'pct', hl: 'share of renters' },
    { group: 'Housing', key: 'median_rent', label: 'Median rent', fmt: 'usd', hl: 'median rent' },
    { group: 'Housing', key: 'pct_rent_burdened', label: 'Renters paying 30%+ of income', fmt: 'pct', hl: 'share of rent-burdened households' },
    { group: 'Housing', key: 'median_home_value', label: 'Median home value', fmt: 'usd', hl: 'median home value' },
    { group: 'Housing', key: 'pct_pre1940', label: 'Homes built before 1940', fmt: 'pct', hl: 'share of prewar homes' },
    { group: 'Households', key: 'avg_hh_size', label: 'Average household size', fmt: 'dec2', hl: 'average household size' },
    { group: 'Households', key: 'pct_living_alone', label: 'Living alone', fmt: 'pct', hl: 'share of people living alone' },
    { group: 'Households', key: 'pct_single_parent', label: 'Single-parent families', fmt: 'pct', hl: 'share of single-parent families' },
    { group: 'Getting around', key: 'pct_transit', label: 'Commute by transit', fmt: 'pct', hl: 'share of transit commuters' },
    { group: 'Getting around', key: 'pct_wfh', label: 'Work from home', fmt: 'pct', hl: 'share working from home' },
    { group: 'Getting around', key: 'pct_no_car', label: 'Households without a car', fmt: 'pct', hl: 'share of car-free households' },
    { group: 'Getting around', key: 'commute_min', label: 'Average commute', fmt: 'min', hl: 'average commute' },
  ];
  const STAT = Object.fromEntries(STATS.map((s) => [s.key, s]));

  // Medians that land in the open-ended top bracket are reported at its floor.
  const TOP_CODED = { median_income: 200000, median_rent: 3500, median_home_value: 2000000 };
  const fmt = (key, v) => {
    if (v == null || Number.isNaN(v)) return '—';
    if (TOP_CODED[key] && v >= TOP_CODED[key]) return '$' + TOP_CODED[key].toLocaleString('en-US') + '+';
    switch (STAT[key]?.fmt) {
      case 'usd': return '$' + Math.round(v).toLocaleString('en-US');
      case 'pct': return (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%';
      case 'dec1': return v.toFixed(1);
      case 'dec2': return v.toFixed(2);
      case 'idx': return v.toFixed(2);
      case 'min': return Math.round(v) + ' min';
      case 'area': return v.toFixed(2) + ' sq. mi.';
      case 'dens': return Math.round(v).toLocaleString('en-US') + ' / sq. mi.';
      default: return Math.round(v).toLocaleString('en-US');
    }
  };
  const pct = (v) => (v == null ? '—' : (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%');
  const ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // ------------------------------------------------------------------------ //
  // State
  // ------------------------------------------------------------------------ //
  const S = {
    data: null, geo: null, hoods: [], bySlug: {}, boroBySlug: {},
    route: null, layerKey: '', selected: null, highlight: new Set(),
    liveSource: null, stripCache: {},
  };
  let layerPicker = null;

  // ------------------------------------------------------------------------ //
  // Data loading
  // ------------------------------------------------------------------------ //
  async function getJSON(url) {
    const res = await fetch(url, { cache: 'default' });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.json();
  }

  function mergeLive(base, live) {
    const d = base;
    for (const [id, n] of Object.entries(live.neighborhoods || {})) {
      if (!d.neighborhoods[id]) continue;
      Object.assign(d.neighborhoods[id], {
        stats: n.stats, dist: n.dist, birthplaces: n.birthplaces, languages: n.languages, rank: n.rank, brank: n.brank,
      });
    }
    for (const [b, v] of Object.entries(live.boroughs || {})) if (d.boroughs[b]) Object.assign(d.boroughs[b], v);
    Object.assign(d.city, live.city);
    Object.assign(d.meta, live.meta);
    return d;
  }

  async function load() {
    const [data, geo, context] = await Promise.all([
      getJSON('data/stats.json'),
      getJSON('data/neighborhoods.geojson'),
      getJSON('data/context.geojson').catch((err) => { console.warn('Context layer unavailable:', err.message); return null; }),
    ]);
    S.data = data;
    S.geo = geo;
    S.context = context;
    // Subway lines load in the background; the map works without them.
    S.subwayReady = getJSON('data/subway.geojson').catch((err) => { console.warn('Subway layer unavailable:', err.message); return null; });
    indexData();
    if (CONFIG.liveStatsUrl) {
      getJSON(CONFIG.liveStatsUrl)
        .then((live) => {
          if (live.error) throw new Error(live.error);
          mergeLive(S.data, live);
          S.liveSource = live.meta?.acs;
          indexData();
          updateSourceNote();
          styleMap();
          render();
        })
        .catch((err) => console.warn('Live stats unavailable, using bundled data:', err.message));
    }
  }

  function indexData() {
    const d = S.data;
    S.hoods = Object.values(d.neighborhoods).sort((a, b) => a.name.localeCompare(b.name));
    S.bySlug = Object.fromEntries(S.hoods.map((h) => [h.slug, h]));
    S.boroBySlug = Object.fromEntries(Object.values(d.boroughs).map((b) => [b.slug, b]));
    S.resCount = S.hoods.filter((h) => h.residential).length;
    S.stripCache = {};
  }

  function updateSourceNote() {
    const m = S.data.meta;
    $('#source-note').textContent = `Data: ${m.acs}, ${m.acs_source}.`;
  }

  // ------------------------------------------------------------------------ //
  // Map
  // ------------------------------------------------------------------------ //
  let map, backControl, contextLayer, hoodLayer, boroLayer, labelLayer, boroLabelLayer;
  const CITY_PADDING = [10, 10];
  const STATE_LABELS = [
    ['New Jersey', [40.78, -74.16]], ['Connecticut', [41.06, -73.56]],
    ['New York', [40.94, -73.82]], // Westchester
    ['New York', [40.755, -73.658], true], // Long Island (Nassau): a narrow strip at the starting view, so stacked
  ];
  const BORO_LABELS = {
    Manhattan: [40.79, -73.965], Brooklyn: [40.645, -73.945], Queens: [40.715, -73.80],
    Bronx: [40.85, -73.875], 'Staten Island': [40.58, -74.15],
  };
  const layerById = {};
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const isDark = () => css('color-scheme') === 'dark';

  function initMap() {
    // No third-party basemap: the neighborhood shapes are the map, drawn over
    // a water-colored background. No tile keys, no usage limits.
    map = L.map('map', { zoomSnap: 0.25, minZoom: 9, maxZoom: 16, attributionControl: true });
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    map.attributionControl.addAttribution('Boundaries: NYC Planning, U.S. Census Bureau');
    map.createPane('context').style.zIndex = 350; // under the neighborhoods (overlayPane = 400)
    map.getPane('context').style.pointerEvents = 'none';
    map.createPane('contextLabels').style.zIndex = 430; // above borough outlines (420) so lines don't cut through
    map.getPane('contextLabels').style.pointerEvents = 'none';
    map.createPane('boro').style.zIndex = 420;
    map.getPane('boro').style.pointerEvents = 'none';
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => styleMap());

    // NY, NJ and CT land around the city, for context only
    if (S.context) {
      contextLayer = L.geoJSON(S.context, { pane: 'context', interactive: false, style: contextStyle }).addTo(map);
      L.layerGroup(STATE_LABELS.map(([name, ll, stacked]) =>
        L.tooltip({ permanent: true, direction: 'center', className: 'nlabel state' + (stacked ? ' stacked' : ''), interactive: false, pane: 'contextLabels' })
          .setLatLng(ll).setContent(stacked ? esc(name).replace(' ', '<br>') : esc(name)))).addTo(map);
    }

    const features = S.geo.features.filter((f) => f.properties.id);
    hoodLayer = L.geoJSON({ type: 'FeatureCollection', features }, {
      style: styleFor,
      onEachFeature: (f, layer) => {
        layerById[f.properties.id] = layer;
        layer.on({
          mouseover: (e) => { hover(f.properties.id, true); showTip(e.originalEvent, tipHTML(f.properties.id)); },
          mousemove: (e) => moveTip(e.originalEvent),
          mouseout: () => { hover(f.properties.id, false); hideTip(); },
          click: () => { hideTip(); location.hash = `#/neighborhood/${S.data.neighborhoods[f.properties.id].slug}`; },
        });
      },
    }).addTo(map);
    boroLayer = L.geoJSON({ type: 'FeatureCollection', features: S.geo.features.filter((f) => f.properties.borough_outline) }, {
      pane: 'boro', interactive: false, style: () => ({ color: css('--boro-line'), weight: 2, fill: false, opacity: 0.9 }),
    }).addTo(map);
    labelLayer = L.layerGroup().addTo(map);
    boroLabelLayer = L.layerGroup(Object.entries(BORO_LABELS).map(([name, ll]) =>
      L.tooltip({ permanent: true, direction: 'center', className: 'nlabel boro', interactive: false }).setLatLng(ll).setContent(esc(name))));
    S.cityBounds = hoodLayer.getBounds();
    // The whole-city view is as far out as the map goes; recompute it when the map resizes.
    const lockMinZoom = () => map.setMinZoom(map.getBoundsZoom(S.cityBounds, false, L.point(CITY_PADDING).multiplyBy(2)));
    lockMinZoom();
    map.fitBounds(S.cityBounds, { padding: CITY_PADDING });
    map.setMaxBounds(S.cityBounds.pad(0.4));
    map.on('resize', lockMinZoom);

    // "All of NYC" button, shown on neighborhood and borough pages
    const BackControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const a = L.DomUtil.create('a', 'leaflet-bar back-control');
        a.href = '#/';
        a.textContent = '← All of NYC';
        a.title = 'Back to the whole city';
        a.hidden = true;
        L.DomEvent.disableClickPropagation(a);
        return a;
      },
    });
    backControl = new BackControl().addTo(map);
    initSubway();
  }

  // ------------------------------------------------------------------------ //
  // Subway overlay: MTA track colored by trunk line, stations once zoomed in
  // ------------------------------------------------------------------------ //
  const SUBWAY_PREF = 'mappingnyc.subway';
  const STATION_MIN_ZOOM = 12.5;
  let subwayGroup = null, subwayCasing = null, subwayLines = null, stationLayer = null, subwayToggle = null;
  const readPref = () => { try { return localStorage.getItem(SUBWAY_PREF) !== 'off'; } catch { return true; } };
  const writePref = (on) => { try { localStorage.setItem(SUBWAY_PREF, on ? 'on' : 'off'); } catch { /* private mode */ } };

  function routeBullets(routes, colors) {
    return routes.map((r) => {
      const c = colors[r] || { color: '#808183', text: '#FFFFFF' };
      return `<span class="bullet${r.length > 1 ? ' wide' : ''}" style="background:${c.color};color:${c.text}">${esc(r)}</span>`;
    }).join('');
  }

  function subwayWeights() {
    const z = map.getZoom();
    const line = z < 11 ? 1.6 : z < 12.5 ? 2.2 : z < 14 ? 3 : 4;
    return { line, casing: line + 2.5, station: z < 14 ? 3 : 4.5 };
  }

  function styleSubway() {
    if (!subwayGroup) return;
    const w = subwayWeights();
    subwayCasing.setStyle({ color: css('--surface'), weight: w.casing, opacity: 0.85 });
    subwayLines.setStyle((f) => ({ color: f.properties.color, weight: w.line, opacity: 1 }));
    stationLayer.eachLayer((m) => m.setStyle({ radius: w.station, color: css('--ink'), fillColor: css('--surface') }));
    const showStations = map.getZoom() >= STATION_MIN_ZOOM;
    if (showStations && !subwayGroup.hasLayer(stationLayer)) subwayGroup.addLayer(stationLayer);
    if (!showStations && subwayGroup.hasLayer(stationLayer)) subwayGroup.removeLayer(stationLayer);
  }

  function setSubway(on) {
    if (!subwayGroup) return;
    if (on) subwayGroup.addTo(map); else subwayGroup.remove();
    subwayToggle?.setAttribute('aria-pressed', String(on));
    writePref(on);
  }

  async function initSubway() {
    const geo = await S.subwayReady;
    if (!geo) return;
    const colors = geo.meta?.route_colors || {};
    map.createPane('subway').style.zIndex = 425; // above borough outlines, below labels
    map.getPane('subway').style.pointerEvents = 'none';
    map.createPane('stations').style.zIndex = 440;
    const lines = { type: 'FeatureCollection', features: geo.features.filter((f) => f.properties.kind === 'line') };
    subwayCasing = L.geoJSON(lines, { pane: 'subway', interactive: false });
    subwayLines = L.geoJSON(lines, { pane: 'subway', interactive: false });
    stationLayer = L.geoJSON({ type: 'FeatureCollection', features: geo.features.filter((f) => f.properties.kind === 'station') }, {
      pointToLayer: (f, ll) => L.circleMarker(ll, { pane: 'stations', weight: 1.5, fillOpacity: 1, bubblingMouseEvents: false }),
      onEachFeature: (f, layer) => {
        const html = `<b>${esc(f.properties.name)}</b><div class="bullets">${routeBullets(f.properties.routes, colors)}</div>`;
        layer.on({
          mouseover: (e) => { layer.setStyle({ weight: 2.5 }); showTip(e.originalEvent, html); },
          mousemove: (e) => moveTip(e.originalEvent),
          mouseout: () => { layer.setStyle({ weight: 1.5 }); hideTip(); },
        });
      },
    });
    subwayGroup = L.layerGroup([subwayCasing, subwayLines]);
    map.attributionControl.addAttribution('Subway: MTA');

    const Toggle = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd() {
        const b = L.DomUtil.create('button', 'leaflet-bar subway-toggle');
        b.type = 'button';
        b.title = 'Show or hide subway lines';
        b.innerHTML = '<span class="subway-icon" aria-hidden="true"></span>Subway';
        L.DomEvent.disableClickPropagation(b);
        b.addEventListener('click', () => setSubway(b.getAttribute('aria-pressed') !== 'true'));
        return b;
      },
    });
    subwayToggle = new Toggle().addTo(map).getContainer();
    map.on('zoomend', styleSubway);
    styleSubway();
    setSubway(readPref());
  }

  function contextStyle() {
    return { color: css('--context-line'), weight: 1, fillColor: css('--context-fill'), fillOpacity: 1, opacity: 1 };
  }

  // Quantile breaks over residential neighborhoods
  function breaksFor(key) {
    const vals = S.hoods.filter((h) => h.residential && h.stats[key] != null).map((h) => h.stats[key]).sort((a, b) => a - b);
    const q = [];
    for (let i = 1; i < 7; i++) q.push(vals[Math.floor((i / 7) * (vals.length - 1))]);
    return { q, min: vals[0], max: vals[vals.length - 1] };
  }
  const classOf = (v, q) => { let i = 0; while (i < q.length && v > q[i]) i++; return i + 1; };

  function styleFor(feature) {
    const id = feature.properties.id;
    const h = S.data.neighborhoods[id];
    const selected = S.selected === id;
    const inSet = S.highlight.has(id);
    const base = { color: css('--map-line'), weight: 0.6, opacity: 0.8, fillOpacity: 0.95, fillColor: css('--map-fill') };
    if (S.layerKey) {
      const v = h.stats[S.layerKey];
      if (!h.residential || v == null) Object.assign(base, { fillColor: css('--nonres'), fillOpacity: 0.7 });
      else Object.assign(base, { fillColor: css(`--seq-${classOf(v, S.breaks.q)}`), fillOpacity: 0.85 });
    } else if (!h.residential) {
      Object.assign(base, { fillColor: css('--nonres'), fillOpacity: 0.6 });
    } else if (selected) {
      Object.assign(base, { fillColor: css('--accent'), fillOpacity: 0.55 });
    } else if (inSet) {
      Object.assign(base, { fillColor: css('--accent'), fillOpacity: 0.16 });
    }
    if (selected) Object.assign(base, { color: isDark() ? '#f0efec' : '#0b0b0b', weight: 3, opacity: 1 });
    else if (inSet) Object.assign(base, { color: css('--accent'), weight: 1.4, opacity: 0.9 });
    return base;
  }

  function styleMap() {
    if (!hoodLayer) return;
    S.breaks = S.layerKey ? breaksFor(S.layerKey) : null;
    hoodLayer.setStyle(styleFor);
    boroLayer.setStyle(() => ({ color: css('--boro-line'), weight: 2, fill: false, opacity: 0.9 }));
    contextLayer?.setStyle(contextStyle);
    styleSubway();
    if (S.selected && layerById[S.selected]) layerById[S.selected].bringToFront();
    renderLegend();
  }

  function hover(id, on) {
    const layer = layerById[id];
    if (!layer) return;
    if (on) {
      layer.setStyle({ weight: Math.max(2.5, styleFor(layer.feature).weight), color: isDark() ? '#f0efec' : '#0b0b0b', opacity: 1 });
      layer.bringToFront();
    } else {
      layer.setStyle(styleFor(layer.feature));
      if (S.selected && layerById[S.selected]) layerById[S.selected].bringToFront();
    }
  }

  function renderLegend() {
    const el = $('#legend');
    if (!S.layerKey) { el.hidden = true; return; }
    const { min, max } = S.breaks;
    el.innerHTML = `<div class="title">${esc(STAT[S.layerKey].label)}</div>
      <div class="ramp">${[1, 2, 3, 4, 5, 6, 7].map((i) => `<span style="background:var(--seq-${i})"></span>`).join('')}</div>
      <div class="ends"><span>${fmt(S.layerKey, min)}</span><span>${fmt(S.layerKey, max)}</span></div>
      <div class="na"><i></i> Parks, cemeteries &amp; other non-residential areas</div>`;
    el.hidden = false;
  }

  function setLayer(key) {
    S.layerKey = key || '';
    layerPicker?.set(S.layerKey);
    styleMap();
  }

  function setLabels(ids) {
    labelLayer.clearLayers();
    if (ids.length) boroLabelLayer.remove(); else boroLabelLayer.addTo(map);
    for (const id of ids) {
      const h = S.data.neighborhoods[id];
      L.tooltip({ permanent: true, direction: 'center', className: 'nlabel' + (id === S.selected ? ' self' : ''), interactive: false })
        .setLatLng(h.center).setContent(esc(h.name)).addTo(labelLayer);
    }
  }

  function tipHTML(id) {
    const h = S.data.neighborhoods[id];
    let rows = '';
    if (S.layerKey && h.residential) {
      const r = h.rank?.[S.layerKey];
      rows = `<div class="row"><span>${esc(STAT[S.layerKey].label)}</span><strong>${fmt(S.layerKey, h.stats[S.layerKey])}</strong></div>` +
        (r ? `<div class="row"><span>Rank</span><span>${ordinal(r)} of ${S.data.meta.rank_n[S.layerKey]}</span></div>` : '');
    } else if (h.residential) {
      rows = `<div class="row"><span>Population</span><strong>${fmt('population', h.stats.population)}</strong></div>`;
    } else {
      rows = `<div class="row"><span>${esc(h.type)}</span></div>`;
    }
    return `<b>${esc(h.name)}</b><div class="row"><span>${esc(h.borough)}</span></div>${rows}`;
  }

  // ------------------------------------------------------------------------ //
  // Tooltip (shared by map and charts)
  // ------------------------------------------------------------------------ //
  const tip = () => $('#tip');
  function showTip(evt, html) { const t = tip(); t.innerHTML = html; t.hidden = false; moveTip(evt); }
  function moveTip(evt) {
    const t = tip();
    if (t.hidden || !evt) return;
    const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + w > innerWidth - 8) x = evt.clientX - w - pad;
    if (y + h > innerHeight - 8) y = evt.clientY - h - pad;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function hideTip() { tip().hidden = true; }

  // ------------------------------------------------------------------------ //
  // Components
  // ------------------------------------------------------------------------ //
  // Stats shown as "where it ranks" strips, and distributions drawn as columns
  // because their categories have an order (the rest are horizontal bars).
  const RANK_KEYS = ['density', 'median_income', 'median_rent', 'median_age', 'diversity', 'pct_foreign_born', 'pct_bachelors', 'pct_transit'];
  const ORDERED_DISTS = new Set(['age', 'income', 'education', 'housing_age', 'building_size']);
  const DIST_SECTIONS = [
    { title: 'Who lives here', parts: ['ethnicity', 'age', 'birthplaces', 'languages'] },
    { title: 'Money and school', parts: ['income', 'education'] },
    { title: 'Homes', parts: ['building_size', 'housing_age'] },
    { title: 'Getting around', parts: ['commute'] },
  ];
  const rankN = (key) => S.data.meta.rank_n[key];
  const acsYears = () => (S.data.meta.acs.match(/\d{4}\s*[-–]\s*\d{4}/) || [''])[0].replace(/\s*[-–]\s*/, '–');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /** Every residential neighborhood's value for one stat, sorted (cached until the data changes). */
  function stripData(key) {
    if (!S.stripCache[key]) {
      const pts = S.hoods.filter((h) => h.residential && h.stats[key] != null)
        .map((h) => ({ id: h.id, v: h.stats[key] })).sort((a, b) => a.v - b.v);
      S.stripCache[key] = { pts, min: pts[0]?.v ?? 0, max: pts[pts.length - 1]?.v ?? 1 };
    }
    return S.stripCache[key];
  }

  /** One stat as a strip of all neighborhoods: ticks for each, a dot for this place, a mark for NYC. */
  function rankRow(key, entity, { members } = {}) {
    const { pts, min, max } = stripData(key);
    const span = max - min || 1;
    const x = (v) => Math.min(100, Math.max(0, ((v - min) / span) * 100));
    const v = entity.stats[key], city = S.data.city.stats[key];
    const r = entity.rank?.[key];
    const cx = x(city);
    const band = (vals, cls) => `<svg class="strip-band ${cls}" viewBox="0 0 100 1" preserveAspectRatio="none" aria-hidden="true">
      <defs>${densityGradient(vals, min, max, `g-${cls}-${key}`)}</defs><rect width="100" height="1" fill="url(#g-${cls}-${key})"/></svg>`;
    const memberVals = members ? pts.filter((p) => members.includes(p.id)).map((p) => p.v) : null;
    return `<div class="rank-row${members ? ' has-members' : ''}" data-strip="${key}">
      <a class="rr-label" href="#/compare/${key}">${esc(STAT[key].label)}</a>
      <div class="rr-rank">${r ? `${ordinal(r)} <span>of ${rankN(key)}</span>` : ''}</div>
      <div class="rr-value">${fmt(key, v)}</div>
      <div class="strip">
        ${band(pts.map((p) => p.v), 'all')}
        ${memberVals?.length ? band(memberVals, 'mem') : ''}
        <span class="strip-city" style="left:${cx}%"></span>
        ${v != null ? `<span class="strip-sel" style="left:${x(v)}%"></span>` : ''}      </div>
      <div class="strip-axis" aria-hidden="true">
        <span class="lo">${cx < 34 ? '' : fmt(key, min)}</span>
        <span class="c${cx < 12 ? ' at-lo' : cx > 88 ? ' at-hi' : ''}" style="left:${cx}%">NYC ${fmt(key, city)}</span>
        <span class="hi">${cx > 66 ? '' : fmt(key, max)}</span>
      </div>
    </div>`;
  }

  /** Horizontal gradient whose opacity follows how many values sit near each point (Gaussian kernel density). */
  function densityGradient(vals, min, max, id) {
    const span = max - min || 1, n = vals.length, BINS = 64;
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || span / 10;
    const h = Math.max(1.06 * sd * n ** -0.2, span / 60); // Silverman's rule, floored so small sets stay smooth
    const dens = Array.from({ length: BINS + 1 }, (_, i) => {
      const t = min + (i / BINS) * span;
      return vals.reduce((s, v) => s + Math.exp(-0.5 * ((t - v) / h) ** 2), 0);
    });
    const top = Math.max(...dens) || 1;
    return `<linearGradient id="${id}">${dens.map((d, i) =>
      `<stop offset="${((i / BINS) * 100).toFixed(1)}%" stop-color="currentColor" stop-opacity="${(0.04 + 0.86 * (d / top)).toFixed(3)}"/>`).join('')}</linearGradient>`;
  }

  function rankSection(entity, opts) {
    return `<div class="rank-rows">${RANK_KEYS.filter((k) => entity.stats[k] != null).map((k) => rankRow(k, entity, opts)).join('')}</div>`;
  }

  const tipAttr = (lab, v, c, entityName, compareName) =>
    `data-tip="${esc(`<b>${esc(lab)}</b><div class='row'><span>${esc(entityName)}</span><strong>${pct(v)}</strong></div>` +
      (c != null ? `<div class='row'><span>${esc(compareName)}</span><span>${pct(c)}</span></div>` : ''))}"`;
  const chartKey = (entityName, compareName) =>
    `<div class="key"><span><i class="sw"></i>${esc(entityName)}</span><span><i class="tick"></i>${esc(compareName)}</span></div>`;

  /** Horizontal bars (unordered categories), with a tick for the comparison. */
  function barChart(title, labels, values, compareValues, entityName, compareName, dek = '', { rest = null } = {}) {
    const max = Math.max(...values, ...(compareValues || []).filter((c) => c != null), 0.0001);
    const rows = labels.map((lab, i) => {
      const v = values[i] ?? 0, c = compareValues?.[i];
      return `<div class="bar-row" ${tipAttr(lab, v, c, entityName, compareName)}>
        <span class="name">${esc(lab)}</span>
        <span class="track"><span class="bar" style="width:${(v / max) * 100}%"></span>${c != null ? `<span class="mark" style="left:${(c / max) * 100}%"></span>` : ''}</span>
        <span class="val">${pct(v)}</span></div>`;
    }).join('');
    // Optional trailing "everything else" row: lighter text, no bar (it would dwarf the scale)
    const restRow = rest ? `<div class="bar-row rest"><span class="name">${esc(rest.label)}</span><span class="track"></span><span class="val">${pct(rest.value)}</span></div>` : '';
    const key = compareValues?.some((c) => c != null) ? chartKey(entityName, compareName) : '';
    return `<div class="chart"><h3>${esc(title)}</h3>${dek ? `<p class="dek">${dek}</p>` : ''}${key}${rows}${restRow}</div>`;
  }

  /** Columns (ordered categories), with a line for the comparison. */
  function colChart(title, labels, values, compareValues, entityName, compareName) {
    const max = Math.max(...values, ...(compareValues || []).filter((c) => c != null), 0.0001);
    const cols = labels.map((lab, i) => {
      const v = values[i] ?? 0, c = compareValues?.[i];
      return `<div class="col" ${tipAttr(lab, v, c, entityName, compareName)}>
        <div class="col-plot"><span class="col-bar" style="height:${(v / max) * 100}%"></span>${c != null ? `<span class="col-cmp" style="bottom:${(c / max) * 100}%"></span>` : ''}</div>
        <div class="col-val">${pct(v)}</div>
        <div class="col-lab">${esc(lab)}</div></div>`;
    }).join('');
    const key = compareValues ? chartKey(entityName, compareName) : '';
    return `<div class="chart"><h3>${esc(title)}</h3>${key}<div class="cols" style="grid-template-columns:repeat(${labels.length},minmax(0,1fr))">${cols}</div></div>`;
  }

  function birthplaceChart(entity, name) {
    if (!entity.birthplaces?.length) return '';
    const top = entity.birthplaces.slice(0, 6);
    const rest = Math.max(0, 1 - top.reduce((s, b) => s + b[2], 0));
    return barChart('Where immigrants were born', top.map((b) => b[0]), top.map((b) => b[2]), null, name, '',
      `${pct(entity.stats.pct_foreign_born)} of residents were born outside the U.S. Each bar is a country's share of those immigrants, not of all residents.`,
      { rest: rest > 0.005 ? { label: 'All other countries', value: rest } : null });
  }

  function languageChart(entity, compare, name, compareName) {
    if (!entity.languages?.length) return '';
    const cmap = Object.fromEntries((compare?.languages || []).map(([n, v]) => [n, v]));
    return barChart('Language at home', entity.languages.map((l) => l[0]), entity.languages.map((l) => l[1]),
      entity.languages.map((l) => cmap[l[0]] ?? null), name, compareName, 'Residents 5 and older.');
  }

  function profileSections(entity, name) {
    const labels = S.data.meta.dist_labels, city = S.data.city;
    return DIST_SECTIONS.map((sec) => {
      const body = sec.parts.map((k) => {
        if (k === 'birthplaces') return birthplaceChart(entity, name);
        if (k === 'languages') return languageChart(entity, city, name, 'NYC');
        if (!entity.dist?.[k]) return '';
        return (ORDERED_DISTS.has(k) ? colChart : barChart)(labels[k].title, labels[k].labels, entity.dist[k], city.dist?.[k], name, 'NYC');
      }).join('');
      return body ? `<section class="sec"><h2>${sec.title}</h2>${body}</section>` : '';
    }).join('');
  }

  /** A few plain-language sentences about a place, built from its numbers. */
  function portrait(e, name) {
    const s = e.stats, c = S.data.city.stats;
    const vs = (a, b) => {
      if (a == null || b == null) return null;
      const q = a / b;
      return q > 1.25 ? 'well above' : q > 1.05 ? 'above' : q >= 0.95 ? 'about the same as' : q >= 0.8 ? 'below' : 'well below';
    };
    const share = (p) => {
      const n = Math.round(p * 10);
      if (n >= 10) return 'nearly all';
      if (n <= 0) return 'very few';
      if (n === 5) return 'about half of all';
      return ['', 'one', 'two', 'three', 'four', '', 'six', 'seven', 'eight', 'nine'][n] + ' in ten';
    };
    const place = (n) => (/other U\.K\./.test(n) ? 'the U.K.' : /Republic|Philippines|Netherlands|Bahamas|^United/.test(n) ? 'the ' + n : n);
    const out = [];
    let first = `${esc(name)} is home to <b>${fmt('population', s.population)}</b> people`;
    const dr = e.rank?.density, dn = rankN('density');
    if (dr && dr <= dn * 0.15) first += ', packed more tightly than most of the city';
    else if (dr && dr > dn * 0.85) first += ', with more elbow room than most of the city';
    out.push(first + '.');
    const inc = vs(s.median_income, c.median_income);
    if (inc) out.push(`The typical household earns <b>${fmt('median_income', s.median_income)}</b> a year, ${inc} the citywide ${fmt('median_income', c.median_income)}.`);
    if (s.pct_renters != null && s.median_rent != null) out.push(`${cap(share(s.pct_renters))} households rent, at a median of <b>${fmt('median_rent', s.median_rent)}</b> a month.`);
    if (s.pct_foreign_born != null) {
      const top = e.birthplaces?.[0]?.[0];
      out.push(`<b>${pct(s.pct_foreign_born)}</b> of residents were born outside the U.S.${top ? `, most often in ${esc(place(top))}` : ''}.`);
    }
    if (s.commute_min != null) out.push(`The average commute is <b>${fmt('commute_min', s.commute_min)}</b>${s.pct_transit != null ? `, and ${pct(s.pct_transit)} of workers take transit` : ''}.`);
    return `<p class="portrait">${out.join(' ')}</p>`;
  }

  function highlights(h) {
    const out = [];
    const n = S.data.meta.rank_n, bn = S.data.meta.brank_n[h.borough] || {};
    const nth = (k, dir) => (k === 1 ? cap(dir) : `${ordinal(k)}-${dir}`);
    for (const s of STATS) {
      if (!s.hl || h.rank?.[s.key] == null) continue;
      const r = h.rank[s.key], N = n[s.key], br = h.brank?.[s.key], BN = bn[s.key];
      let text = null, score = 0;
      if (r <= 3) { text = `${nth(r, 'highest')} ${s.hl} in the city`; score = 10 - r; }
      else if (r > N - 3) { const k = N - r + 1; text = `${nth(k, 'lowest')} ${s.hl} in the city`; score = 10 - k; }
      else if (br === 1) { text = `Highest ${s.hl} in ${h.borough}`; score = 5; }
      else if (BN && br === BN) { text = `Lowest ${s.hl} in ${h.borough}`; score = 5; }
      if (text) out.push({ text, score, key: s.key });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 4);
  }

  function statsTable(cols) {
    // cols: [{name, entity, rank?:bool}]
    let html = `<div class="tblwrap"><table class="tbl"><thead><tr><th>Measure</th>${cols.map((c) => `<th>${esc(c.name)}</th>`).join('')}</tr></thead><tbody>`;
    let group = '';
    for (const s of STATS) {
      if (s.group !== group) { group = s.group; html += `<tr class="group"><td colspan="${cols.length + 1}">${esc(group)}</td></tr>`; }
      html += `<tr><td><a href="#/compare/${s.key}">${esc(s.label)}</a></td>` + cols.map((c) => {
        if (c.rank) {
          const r = c.entity.rank?.[s.key];
          return `<td class="muted">${r ? `${ordinal(r)} / ${S.data.meta.rank_n[s.key]}` : '—'}</td>`;
        }
        return `<td>${fmt(s.key, c.entity.stats[s.key])}</td>`;
      }).join('') + '</tr>';
    }
    return html + '</tbody></table></div>';
  }

  const allNumbers = (cols, dek = '') =>
    `<details class="allnums"><summary><span>All the numbers</span><small>${STATS.length} measures</small></summary>${dek ? `<p class="dek">${dek}</p>` : ''}${statsTable(cols)}</details>`;

  function hoodLink(id) {
    const h = S.data.neighborhoods[id];
    return `<a href="#/neighborhood/${h.slug}">${esc(h.name)}</a>`;
  }

  /** Grouped, filterable measure picker (replaces the native <select>). */
  function mountPicker(root, { value = '', includeNone = false, kicker = '', onChange }) {
    const opts = includeNone ? [{ key: '', label: 'Just the neighborhoods', group: '' }] : [];
    for (const s of STATS) if (!s.nomap) opts.push({ key: s.key, label: s.label, group: s.group });
    const uid = 'pk' + Math.random().toString(36).slice(2, 8);
    root.classList.add('picker');
    root.innerHTML = `<button type="button" class="picker-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="${uid}-pop">
        ${kicker ? `<span class="picker-kicker">${esc(kicker)}</span>` : ''}<span class="picker-value"></span>
        <svg class="picker-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="picker-pop" id="${uid}-pop" hidden>
        <input class="picker-filter" type="text" placeholder="Filter measures…" aria-label="Filter measures" role="combobox"
          aria-expanded="true" aria-controls="${uid}-list" aria-autocomplete="list" autocomplete="off" spellcheck="false">
        <div class="picker-list" id="${uid}-list" role="listbox" aria-label="Measures"></div>
      </div>`;
    const btn = $('.picker-btn', root), pop = $('.picker-pop', root), input = $('.picker-filter', root), list = $('.picker-list', root);
    let current = value, shown = [], active = 0;
    const paint = () => { $('.picker-value', root).textContent = opts.find((o) => o.key === current)?.label || ''; };
    const setActive = (i, scroll) => {
      active = i;
      list.querySelectorAll('.picker-opt').forEach((el) => el.toggleAttribute('data-active', +el.dataset.i === i));
      input.setAttribute('aria-activedescendant', shown.length ? `${uid}-${i}` : '');
      if (scroll) list.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' });
    };
    const draw = () => {
      const q = input.value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(^|[^a-z0-9])${q}`, 'i'); // match at word starts, so "rent" skips "parent"
      shown = opts.filter((o) => !q || re.test(o.label) || re.test(o.group));
      let html = '', group = null;
      shown.forEach((o, i) => {
        if (o.group !== group) {
          if (group !== null) html += '</div>';
          group = o.group;
          html += `<div class="picker-group" role="group"${o.group ? ` aria-label="${esc(o.group)}"` : ''}>${o.group ? `<div class="picker-gh" aria-hidden="true">${esc(o.group)}</div>` : ''}`;
        }
        html += `<div class="picker-opt" role="option" id="${uid}-${i}" data-i="${i}" aria-selected="${o.key === current}">${esc(o.label)}</div>`;
      });
      list.innerHTML = html ? html + '</div>' : `<p class="picker-empty">Nothing matches “${esc(input.value)}”.</p>`;
      setActive(Math.min(active, Math.max(shown.length - 1, 0)), true);
    };
    const outside = (e) => { if (!root.contains(e.target)) close(false); };
    const open = () => {
      // Open toward the side with more room, and fit inside the map (or the viewport).
      const r = btn.getBoundingClientRect();
      const box = root.closest('.mapwrap')?.getBoundingClientRect() || { top: 0, bottom: innerHeight };
      const above = r.top - Math.max(box.top, 0) - 12, below = Math.min(box.bottom, innerHeight) - r.bottom - 12;
      const up = above > below;
      root.classList.toggle('up', up);
      pop.style.maxHeight = `${Math.max(Math.min(up ? above : below, 520), 220)}px`;
      pop.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      input.value = '';
      active = Math.max(0, opts.findIndex((o) => o.key === current));
      draw();
      if (!matchMedia('(pointer: coarse)').matches) input.focus({ preventScroll: true });
      document.addEventListener('pointerdown', outside, true);
    };
    function close(focusBtn) {
      pop.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outside, true);
      if (focusBtn) btn.focus();
    }
    const choose = (o) => { if (!o) return; current = o.key; paint(); close(true); onChange(o.key); };
    btn.addEventListener('click', () => (pop.hidden ? open() : close(false)));
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' && pop.hidden) { open(); e.preventDefault(); } });
    input.addEventListener('input', () => { active = 0; draw(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { setActive(Math.min(active + 1, shown.length - 1), true); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { setActive(Math.max(active - 1, 0), true); e.preventDefault(); }
      else if (e.key === 'Enter') { choose(shown[active]); e.preventDefault(); }
      else if (e.key === 'Escape') { close(true); e.preventDefault(); }
      else if (e.key === 'Tab') close(false);
    });
    list.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the filter box
    list.addEventListener('click', (e) => { const el = e.target.closest('.picker-opt'); if (el) choose(shown[+el.dataset.i]); });
    list.addEventListener('mousemove', (e) => { const el = e.target.closest('.picker-opt'); if (el && +el.dataset.i !== active) setActive(+el.dataset.i, false); });
    paint();
    return { set(v) { current = v; paint(); } };
  }

  // ------------------------------------------------------------------------ //
  // Pages
  // ------------------------------------------------------------------------ //
  function pageHome() {
    const d = S.data;
    S.selected = null; S.highlight = new Set();
    setLabels([]);
    map.flyToBounds(S.cityBounds, { padding: [10, 10], duration: 0.6 });
    const cityPop = d.city.stats.population;
    const boroTotal = d.meta.boroughs.reduce((sum, b) => sum + d.boroughs[b].stats.population, 0);
    const shareText = (v) => `${Math.round((v / boroTotal) * 100)}%`;
    const boros = d.meta.boroughs.map((b, i) => {
      const B = d.boroughs[b];
      const members = S.hoods.filter((h) => h.borough === b && h.residential);
      return `<details class="boro" data-hl="${B.slug}" style="--c:var(--cat-${i + 1})"><summary>
          <i class="boro-sw" aria-hidden="true"></i>
          <span class="boro-name">${esc(b)}</span>
          <span class="boro-pct">${shareText(B.stats.population)}</span>
          <span class="boro-meta">${members.length} neighborhoods · ${fmt('population', B.stats.population)} people</span>
        </summary>
        <p class="boro-go"><a href="#/borough/${B.slug}">Open the ${esc(b)} profile →</a></p>
        <ul>${members.map((h) => `<li><a href="#/neighborhood/${h.slug}">${esc(h.name)}</a></li>`).join('')}</ul></details>`;
    }).join('');
    const asks = [
      ['diversity', 'Where is the city most diverse?'],
      ['density', 'Where are people most packed in?'],
      ['median_income', 'Where do households earn the most?'],
      ['median_rent', 'Where is rent highest?'],
      ['pct_foreign_born', 'Where do the most immigrants live?'],
      ['commute_min', 'Who has the longest commute?'],
    ];
    return `<p class="kicker">Five boroughs · ${S.resCount} neighborhoods · ACS ${acsYears()}</p>
      <h1>New York, neighborhood by neighborhood</h1>
      <p class="lede">Who lives where, what they earn, what they pay and how they get to work, for every residential neighborhood in the city.</p>
      <div class="figures">${['population', 'median_income', 'median_age', 'diversity'].map((k) =>
        `<div class="fig"><div class="fig-v">${fmt(k, d.city.stats[k])}</div><div class="fig-l">${esc(STAT[k].label)}</div></div>`).join('')}</div>
      <section class="sec"><h2>Ask the map</h2>
      <ul class="asks">${asks.map(([k, q]) => `<li><a href="#/compare/${k}">${q}<span aria-hidden="true">→</span></a></li>`).join('')}</ul></section>
      <section class="sec"><h2>The five boroughs</h2>
      <p class="dek">Each borough's share of the city's ${fmt('population', cityPop)} people. Open a borough to list its neighborhoods.</p>
      <div class="boro-chart">${boroughPie(d.meta.boroughs.map((b, i) => ({ B: d.boroughs[b], color: `var(--cat-${i + 1})` })), boroTotal, shareText)}
      <div class="boros">${boros}</div></div></section>`;
  }

  /** Pie of borough populations, clockwise from 12 o'clock in the fixed borough order. Slices link to boroughs. */
  function boroughPie(items, total, shareText) {
    return pieSvg(items.map(({ B, color }) => {
      const v = B.stats.population;
      return {
        key: B.slug, value: v, color, href: `#/borough/${B.slug}`, label: shareText(v),
        aria: `${B.name}, ${shareText(v)} of New Yorkers`,
        tip: `<b>${esc(B.name)}</b><div class='row'><span>People</span><strong>${fmt('population', v)}</strong></div><div class='row'><span>Share of NYC</span><span>${shareText(v)}</span></div>`,
      };
    }), total, 'Population by borough');
  }

  /** A pie, clockwise from 12 o'clock. items: {key, value, color, label?, href?, tip, aria}. Slices share `data-hl` keys with their legend rows. */
  function pieSvg(items, total, ariaLabel) {
    const pt = (a, r) => `${(Math.cos(a) * r).toFixed(4)} ${(Math.sin(a) * r).toFixed(4)}`;
    let a0 = -Math.PI / 2;
    const slices = items.map((it) => {
      const a1 = a0 + (it.value / total) * 2 * Math.PI;
      const mid = (a0 + a1) / 2, cos = Math.cos(mid), sin = Math.sin(mid);
      const path = a1 - a0 >= 2 * Math.PI - 1e-6
        ? 'M0 -1A1 1 0 1 1 0 1A1 1 0 1 1 0 -1Z'
        : `M0 0L${pt(a0, 1)}A1 1 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${pt(a1, 1)}Z`;
      const anchor = Math.abs(cos) < 0.25 ? 'middle' : cos > 0 ? 'start' : 'end';
      a0 = a1;
      const tag = it.href ? 'a' : 'g';
      return `<${tag}${it.href ? ` href="${it.href}"` : ''} class="slice" data-hl="${it.key}" data-tip="${esc(it.tip)}" aria-label="${esc(it.aria)}"${it.href ? '' : ' role="img"'}
          style="--dx:${(cos * 0.06).toFixed(3)}px;--dy:${(sin * 0.06).toFixed(3)}px">
          <path d="${path}" fill="${it.color}"/>
          ${it.label ? `<text x="${(cos * 1.16).toFixed(3)}" y="${(sin * 1.16).toFixed(3)}" text-anchor="${anchor}" dominant-baseline="middle">${it.label}</text>` : ''}
        </${tag}>`;
    }).join('');
    return `<svg class="pie" viewBox="-1.5 -1.32 3 2.64" role="group" aria-label="${esc(ariaLabel)}">${slices}</svg>`;
  }

  function pageNeighborhood(h) {
    const d = S.data;
    S.selected = h.id;
    S.highlight = new Set(h.neighbors);
    setLabels([h.id, ...h.neighbors]);
    const layer = layerById[h.id];
    if (layer) map.flyToBounds(L.featureGroup([layer, ...h.neighbors.map((n) => layerById[n]).filter(Boolean)]).getBounds(), { padding: [30, 30], duration: 0.6, maxZoom: 15 });
    const B = d.boroughs[h.borough];
    const crumbs = `<nav class="crumbs" aria-label="Breadcrumb"><a class="back-city" href="#/">← All of NYC</a><a href="#/borough/${B.slug}">${esc(h.borough)}</a></nav>`;
    const nextDoor = h.neighbors.length ? `<p class="nextdoor"><span>Next door</span> ${h.neighbors.map(hoodLink).join(', ')}</p>` : '';

    if (!h.residential) {
      return `${crumbs}<p class="kicker">${esc(h.type)} · ${esc(h.borough)}</p><h1>${esc(h.name)}</h1>
        <p class="portrait">${esc(h.name)} is one of ${S.hoods.length - S.resCount} parks, cemeteries, airports and other special areas that NYC Planning maps separately from residential neighborhoods.
        ${h.stats.population ? `About ${fmt('population', h.stats.population)} people are counted here, too few for reliable statistics, so it isn't ranked.` : 'Nobody lives here, so it has no demographic profile.'}
        It covers ${fmt('area_sqmi', h.stats.area_sqmi)}.</p>${nextDoor}`;
    }

    const hl = highlights(h);
    return `${crumbs}<p class="kicker">${esc(h.borough)} · Community district ${esc(String(h.cd || '').split(' ')[0])}</p>
      <h1>${esc(h.name)}</h1>
      ${portrait(h, h.name)}
      ${nextDoor}
      ${hl.length ? `<section class="sec"><h2>What stands out</h2><ul class="standouts">${hl.map((x) =>
        `<li><a href="#/compare/${x.key}"><span class="so-v">${fmt(x.key, h.stats[x.key])}</span><span class="so-t">${esc(x.text)}</span></a></li>`).join('')}</ul></section>` : ''}
      <section class="sec"><h2>Where it ranks</h2>
        <p class="dek">Shading shows where the city's ${S.resCount} neighborhoods cluster: darker means more of them. The solid black line is ${esc(h.name)}, the dashed line NYC as a whole.</p>
        ${rankSection(h)}</section>
      ${profileSections(h, h.name)}
      ${allNumbers([{ name: h.name, entity: h }, { name: h.borough, entity: B }, { name: 'NYC', entity: d.city }, { name: 'Rank', entity: h, rank: true }],
        `Ranks are out of ${S.resCount} residential neighborhoods; 1st is the highest value.`)}
      ${sourceNote()}`;
  }

  function pageBorough(B) {
    const d = S.data;
    const members = S.hoods.filter((h) => h.borough === B.name);
    S.selected = null;
    S.highlight = new Set(members.map((h) => h.id));
    setLabels([]);
    map.flyToBounds(L.featureGroup(members.map((h) => layerById[h.id]).filter(Boolean)).getBounds(), { padding: [20, 20], duration: 0.6 });
    const res = members.filter((h) => h.residential);
    return `<nav class="crumbs" aria-label="Breadcrumb"><a class="back-city" href="#/">← All of NYC</a></nav>
      <p class="kicker">Borough · ${res.length} neighborhoods</p>
      <h1>${esc(B.name)}</h1>
      ${portrait(B, B.name)}
      <section class="sec"><h2>How its neighborhoods compare</h2>
        <p class="dek">The blue band shades where all ${S.resCount} neighborhoods cluster (darker means more); the black band below it does the same for ${esc(B.name)}'s. The solid black line is the borough as a whole, the dashed line NYC.</p>
        ${rankSection(B, { members: res.map((h) => h.id) })}</section>
      <section class="sec"><h2>Neighborhoods</h2>
        <p class="dek">Select a column to sort.</p>
        <div id="boro-table"></div></section>
      ${profileSections(B, B.name)}
      ${allNumbers([{ name: B.name, entity: B }, { name: 'NYC', entity: d.city }])}
      ${sourceNote()}`;
  }

  function mountBoroughTable(B) {
    const rows = S.hoods.filter((h) => h.borough === B.name && h.residential);
    const cols = [
      { key: 'name', label: 'Neighborhood', get: (h) => h.name, text: true },
      { key: 'population', label: 'Population' },
      { key: 'median_income', label: 'Median income' },
      { key: 'diversity', label: 'Diversity' },
    ];
    sortableTable($('#boro-table'), rows, cols, 'name', true);
  }

  function sortableTable(el, rows, cols, sortKey, asc) {
    const draw = () => {
      const col = cols.find((c) => c.key === sortKey);
      const get = col.get || ((h) => h.stats[col.key]);
      const sorted = [...rows].sort((a, b) => {
        const x = get(a), y = get(b);
        if (x == null) return 1; if (y == null) return -1;
        return (col.text ? String(x).localeCompare(String(y)) : x - y) * (asc ? 1 : -1);
      });
      el.innerHTML = `<div class="tblwrap"><table class="tbl"><thead><tr>${cols.map((c) => `<th><button data-k="${c.key}" ${c.key === sortKey ? `aria-sort="${asc ? 'ascending' : 'descending'}"` : ''}>${esc(c.label)}</button></th>`).join('')}</tr></thead>
        <tbody>${sorted.map((h) => `<tr class="click" data-slug="${h.slug}">${cols.map((c) => `<td>${c.text ? `<a href="#/neighborhood/${h.slug}">${esc((c.get || ((x) => x.stats[c.key]))(h))}</a>` : fmt(c.key, h.stats[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    };
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-k]');
      if (btn) {
        const k = btn.dataset.k;
        if (k === sortKey) asc = !asc; else { sortKey = k; asc = !!cols.find((c) => c.key === k).text; }
        draw();
        return;
      }
      const tr = e.target.closest('tr[data-slug]');
      if (tr && !e.target.closest('a')) location.hash = `#/neighborhood/${tr.dataset.slug}`;
    });
    draw();
  }

  // Compare page: every residential neighborhood on one measure, filterable by
  // borough and sortable. URL: #/compare/<stat>[/<borough>][?sort=low|az]
  const SORTS = [['high', 'Highest'], ['low', 'Lowest'], ['az', 'A–Z']];
  const compareHref = (key, boroSlug, sort) =>
    `#/compare/${key}${boroSlug ? '/' + boroSlug : ''}${sort && sort !== 'high' ? '?sort=' + sort : ''}`;

  function compareHeading(key, sort) {
    const phrase = STAT[key].hl || STAT[key].label.toLowerCase();
    return sort === 'low' ? `Lowest ${phrase}` : sort === 'az' ? `Neighborhoods by ${phrase}` : `Highest ${phrase}`;
  }

  function pageCompare(key, boro, sort) {
    const s = STAT[key] || STAT.median_income;
    key = s.key;
    sort = SORTS.some(([k]) => k === sort) ? sort : 'high';
    S.selected = null; S.highlight = new Set();
    setLabels([]);
    setLayer(key);
    const boroughs = S.data.meta.boroughs;
    const boroSlug = (b) => S.data.boroughs[b].slug;
    const rankOf = (h) => (boro ? h.brank[key] : h.rank[key]);
    // Order by rank, not the displayed value: ranks break ties that rounding hides.
    const rows = S.hoods.filter((h) => h.residential && h.stats[key] != null && (!boro || h.borough === boro))
      .sort(sort === 'az' ? (a, b) => a.name.localeCompare(b.name)
        : sort === 'low' ? (a, b) => rankOf(b) - rankOf(a) : (a, b) => rankOf(a) - rankOf(b));
    const members = boro ? S.hoods.filter((h) => h.borough === boro) : null;
    map.flyToBounds(members ? L.featureGroup(members.map((h) => layerById[h.id])).getBounds() : S.cityBounds, { padding: [20, 20], duration: 0.6 });
    const max = Math.max(...rows.map((h) => h.stats[key]));
    const boroFig = boro && S.data.boroughs[boro]?.stats?.[key];
    return `<p class="kicker">Compare · ${rows.length} neighborhoods${boro ? ` in ${esc(boro === 'Bronx' ? 'the Bronx' : boro)}` : ''}</p>
      <div class="cmp-bar">
        <div id="rank-picker" class="rank-picker"></div>
        <div class="cmp-filters">
          <div class="seg" role="group" aria-label="Sort">
            ${SORTS.map(([k, label]) => `<a href="${compareHref(key, boro && boroSlug(boro), k)}" aria-pressed="${sort === k}">${label}</a>`).join('')}
          </div>
          <div class="seg" role="group" aria-label="Filter by borough">
            <a href="${compareHref(key, null, sort)}" aria-pressed="${!boro}">All</a>
            ${boroughs.map((b) => `<a href="${compareHref(key, boroSlug(b), sort)}" aria-pressed="${boro === b}">${esc(b)}</a>`).join('')}
          </div>
        </div>
      </div>
      <h1>${esc(cap(compareHeading(key, sort)))}</h1>
      <p class="dek">Citywide: ${fmt(key, S.data.city.stats[key])}${boroFig != null ? `. ${esc(boro)}: ${fmt(key, boroFig)}` : ''}.
        Numbers are ranks, with 1st the highest${boro ? ` in ${esc(boro === 'Bronx' ? 'the Bronx' : boro)}` : ''}. Parks, cemeteries and airports are left out.</p>
      <ol class="ladder">
        ${rows.map((h) => `<li${rankOf(h) <= 3 ? ' class="top"' : ''}><a href="#/neighborhood/${h.slug}">
          <span class="lad-n">${rankOf(h)}</span>
          <span class="lad-name">${esc(h.name)}${boro ? '' : `<small>${esc(h.borough)}</small>`}</span>
          <span class="lad-v">${fmt(key, h.stats[key])}</span>
          <span class="lad-bar" aria-hidden="true"><i style="width:${max > 0 ? (h.stats[key] / max) * 100 : 0}%"></i></span>
        </a></li>`).join('')}
      </ol>
      ${sourceNote()}`;
  }

  function pageAbout() {
    S.selected = null; S.highlight = new Set();
    setLabels([]);
    const m = S.data.meta;
    return `<div class="prose"><p class="kicker">About</p><h1>How this works</h1>
      <p class="lede">MappingNYC profiles every neighborhood in New York City, in the spirit of the Los Angeles Times' Mapping L.A. project.</p>
      <h2>Neighborhood boundaries</h2>
      <p>Neighborhoods are the city's 2020 Neighborhood Tabulation Areas (NTAs), drawn by the NYC Department of City Planning from whole census tracts. There are 262 of them: ${S.resCount} residential neighborhoods plus parks, cemeteries, airports and other special areas, which are mapped but not ranked. NTA names and lines don't always match what residents call home, and some combine several familiar neighborhoods.</p>
      <h2>Data</h2>
      <p>${esc(m.acs)}. Source: ${esc(m.acs_source)}. The American Community Survey is based on a sample, so every figure has a margin of error, which is larger for small groups and small neighborhoods. Treat small differences between neighborhoods as noise.</p>
      <ul>
        <li><strong>Diversity index</strong>: the chance that two residents picked at random are of different races or ethnicities (Latino, white, Black, Asian, other). 0 means everyone is the same; the maximum with five groups is 0.80.</li>
        <li><strong>Ranks</strong> compare the ${S.resCount} residential neighborhoods. 1st is the highest value, whether that's good or bad.</li>
        <li><strong>Medians</strong> for boroughs and the city${m.medians ? ' (and for neighborhoods, when data comes from the Census API)' : ''} are estimated from income, rent, value and age brackets.</li>
        <li><strong>Density</strong> uses land area within each boundary.</li>
        <li><strong>Neighborhood portraits</strong> are written automatically from the numbers on each page.</li>
      </ul>
      <h2>Sources</h2>
      <ul>
        <li><a href="https://www.nyc.gov/content/planning/pages/resources/datasets/neighborhood-tabulation" target="_blank" rel="noopener">2020 Neighborhood Tabulation Areas</a>, NYC Department of City Planning (via NYC Open Data)</li>
        <li>American Community Survey 5-year estimates by NTA, NYC Department of City Planning, Population Division</li>
        <li><a href="https://www.census.gov/data/developers/data-sets/acs-5year.html" target="_blank" rel="noopener">Census Bureau ACS API</a></li>
        <li>New York, New Jersey and Connecticut outlines: U.S. Census Bureau cartographic boundary files</li>
      </ul></div>`;
  }

  function sourceNote() {
    const m = S.data.meta;
    return `<p class="note">Source: ${esc(m.acs)}, ${esc(m.acs_source)}. Estimates have margins of error; small differences may not be meaningful.</p>`;
  }

  // ------------------------------------------------------------------------ //
  // Router
  // ------------------------------------------------------------------------ //
  function parseRoute() {
    const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
    const parts = path.split('/').map(decodeURIComponent);
    let page = parts[0] || 'home';
    if (page === 'rankings') page = 'compare'; // old links
    return { page, a: parts[1], b: parts[2], sort: new URLSearchParams(query).get('sort') || undefined };
  }

  function render() {
    const panel = $('#panel');
    const r = parseRoute();
    const changed = JSON.stringify(r) !== JSON.stringify(S.route);
    const firstRender = !S.route;
    S.route = r;
    let html, title = 'MappingNYC', nav = r.page, after = null;
    if (r.page !== 'compare' && changed && S.layerKey && S.layerFromRanking) { setLayer(''); }
    S.layerFromRanking = false;

    if (r.page === 'neighborhood' && S.bySlug[r.a]) {
      const h = S.bySlug[r.a];
      html = pageNeighborhood(h); title = `${h.name}, ${h.borough} · MappingNYC`; nav = 'home';
    } else if (r.page === 'borough' && S.boroBySlug[r.a]) {
      const B = S.boroBySlug[r.a];
      html = pageBorough(B); title = `${B.name} · MappingNYC`; nav = 'home';
      after = () => mountBoroughTable(B);
    } else if (r.page === 'compare') {
      const boro = r.b ? S.boroBySlug[r.b]?.name : null;
      const key = STAT[r.a] && !STAT[r.a].nomap ? r.a : 'median_income';
      html = pageCompare(key, boro, r.sort); title = `${cap(compareHeading(key, r.sort))} · MappingNYC`;
      S.layerFromRanking = true;
      after = () => mountPicker($('#rank-picker'), { value: key, kicker: 'Measure', onChange: (k) => { location.hash = compareHref(k, boro && r.b, r.sort); } });
    } else if (r.page === 'about') {
      html = pageAbout(); title = 'About · MappingNYC';
    } else {
      html = pageHome(); nav = 'home';
    }
    panel.innerHTML = html;
    if (after) after();
    if (backControl) backControl.getContainer().hidden = !['neighborhood', 'borough'].includes(r.page) || !(S.bySlug[r.a] || S.boroBySlug[r.a]);
    document.title = title;
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
    styleMap();
    if (changed) { panel.scrollTop = 0; if (!firstRender && innerWidth <= 900 && r.page !== 'home') panel.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  }

  // Chart tooltips (event delegation)
  function wireChartTips() {
    const panel = $('#panel');
    panel.addEventListener('mouseover', (e) => {
      const row = e.target.closest('[data-tip]');
      if (row) showTip(e, row.dataset.tip);
    });
    panel.addEventListener('mousemove', (e) => { if (e.target.closest('[data-tip]')) moveTip(e); });
    panel.addEventListener('mouseout', (e) => {
      if (e.target.closest('[data-tip]') && !e.relatedTarget?.closest?.('[data-tip]')) hideTip();
    });
    panel.addEventListener('scroll', hideTip, { passive: true });

    // Pies <-> legend rows: hovering either lights up both
    const hot = (k, on) => panel.querySelectorAll(`[data-hl="${CSS.escape(k)}"]`).forEach((el) => el.classList.toggle('hot', on));
    panel.addEventListener('mouseover', (e) => { const el = e.target.closest('[data-hl]'); if (el) hot(el.dataset.hl, true); });
    panel.addEventListener('mouseout', (e) => {
      const el = e.target.closest('[data-hl]');
      if (el && e.relatedTarget?.closest?.('[data-hl]')?.dataset.hl !== el.dataset.hl) hot(el.dataset.hl, false);
    });
  }

  // ------------------------------------------------------------------------ //
  // Search
  // ------------------------------------------------------------------------ //
  function wireSearch() {
    const input = $('#search-input'), list = $('#search-results');
    let items = [], active = 0;
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); };
    const go = (it) => { if (!it) return; location.hash = it.href; input.value = ''; close(); input.blur(); };
    const draw = () => {
      list.innerHTML = items.map((it, i) => `<li role="option" aria-selected="${i === active}" data-i="${i}">${esc(it.name)}<small>${esc(it.sub)}</small></li>`).join('');
      list.hidden = !items.length;
      input.setAttribute('aria-expanded', String(!!items.length));
    };
    input.addEventListener('input', () => {
      const q = norm(input.value.trim());
      if (!q) { items = []; close(); return; }
      const pool = [
        ...Object.values(S.data.boroughs).map((b) => ({ name: b.name, sub: 'Borough', href: `#/borough/${b.slug}` })),
        ...S.hoods.map((h) => ({ name: h.name, sub: h.residential ? h.borough : `${h.type}, ${h.borough}`, href: `#/neighborhood/${h.slug}` })),
      ];
      items = pool.filter((it) => norm(it.name).includes(q))
        .sort((a, b) => norm(a.name).indexOf(q) - norm(b.name).indexOf(q) || a.name.localeCompare(b.name)).slice(0, 10);
      active = 0; draw();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === 'Enter') { go(items[active]); }
      else if (e.key === 'Escape') { close(); }
    });
    list.addEventListener('mousedown', (e) => { const li = e.target.closest('li'); if (li) go(items[+li.dataset.i]); });
    input.addEventListener('blur', () => setTimeout(close, 120));
  }

  // ------------------------------------------------------------------------ //
  // Boot
  // ------------------------------------------------------------------------ //
  async function boot() {
    try {
      await load();
    } catch (err) {
      $('#panel').innerHTML = `<p class="error">Couldn't load data (${esc(err.message)}). If you opened index.html directly from disk, serve the folder instead: <code>python3 -m http.server</code>.</p>`;
      return;
    }
    updateSourceNote();
    layerPicker = mountPicker($('#layer-picker'), {
      includeNone: true, kicker: 'Color by',
      onChange: (k) => { setLayer(k); S.layerFromRanking = false; },
    });
    initMap();
    wireSearch();
    wireChartTips();
    window.addEventListener('hashchange', render);
    render();
  }

  boot();
})();
