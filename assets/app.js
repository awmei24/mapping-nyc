/* Mapping NYC — single-page app (hash routing, works on GitHub Pages). */
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
  const TILE_KEYS = ['population', 'density', 'median_age', 'median_income', 'diversity', 'pct_foreign_born'];
  const DIST_ORDER = ['ethnicity', 'age', 'income', 'education', 'commute', 'building_size', 'housing_age'];

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
    liveSource: null,
  };

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
  const STATE_LABELS = {
    'New Jersey': [40.78, -74.16], Connecticut: [41.06, -73.56], 'New York': [40.94, -73.82],
  };
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
    map.createPane('contextLabels').style.zIndex = 360;
    map.getPane('contextLabels').style.pointerEvents = 'none';
    map.createPane('boro').style.zIndex = 420;
    map.getPane('boro').style.pointerEvents = 'none';
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => styleMap());

    // NY, NJ and CT land around the city, for context only
    if (S.context) {
      contextLayer = L.geoJSON(S.context, { pane: 'context', interactive: false, style: contextStyle }).addTo(map);
      L.layerGroup(Object.entries(STATE_LABELS).map(([name, ll]) =>
        L.tooltip({ permanent: true, direction: 'center', className: 'nlabel state', interactive: false, pane: 'contextLabels' })
          .setLatLng(ll).setContent(esc(name)))).addTo(map);
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
    $('#layer-select').value = S.layerKey;
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
  function tile(key, entity, compare) {
    const v = entity.stats[key];
    let meta = '';
    if (entity.rank && entity.rank[key]) meta = `${ordinal(entity.rank[key])} of ${S.data.meta.rank_n[key]} · `;
    if (compare) meta += `NYC ${fmt(key, compare.stats[key])}`;
    return `<div class="tile"><div class="label">${esc(STAT[key].label)}</div><div class="value">${fmt(key, v)}</div><div class="meta">${meta}</div></div>`;
  }

  /** Horizontal bars: entity share per category with a tick for the comparison. */
  function barChart(title, labels, values, compareValues, entityName, compareName, dek = '') {
    const max = Math.max(...values, ...(compareValues || []), 0.0001);
    const rows = labels.map((lab, i) => {
      const v = values[i] ?? 0, c = compareValues?.[i];
      const data = `data-tip="${esc(`<b>${esc(lab)}</b><div class='row'><span>${esc(entityName)}</span><strong>${pct(v)}</strong></div>` + (c != null ? `<div class='row'><span>${esc(compareName)}</span><span>${pct(c)}</span></div>` : ''))}"`;
      return `<div class="bar-row" ${data}>
        <span class="name">${esc(lab)}</span>
        <span class="track"><span class="bar" style="width:${(v / max) * 100}%"></span>${c != null ? `<span class="mark" style="left:calc(${(c / max) * 100}% - 1px)"></span>` : ''}</span>
        <span class="val">${pct(v)}</span></div>`;
    }).join('');
    const key = compareValues ? `<div class="key"><span><i class="sw"></i>${esc(entityName)}</span><span><i class="tick"></i>${esc(compareName)}</span></div>` : '';
    return `<h2>${esc(title)}</h2>${dek ? `<p class="dek">${dek}</p>` : ''}<div class="chart">${key}${rows}</div>`;
  }

  function distCharts(entity, compare, entityName, compareName) {
    const labels = S.data.meta.dist_labels;
    return DIST_ORDER.filter((k) => entity.dist?.[k]).map((k) =>
      barChart(labels[k].title, labels[k].labels, entity.dist[k], compare?.dist?.[k], entityName, compareName)).join('');
  }

  function birthplaceChart(entity, name) {
    if (!entity.birthplaces?.length) return '';
    const fb = entity.stats.pct_foreign_born;
    return barChart('Where foreign-born residents come from', entity.birthplaces.map((b) => b[0]), entity.birthplaces.map((b) => b[2]), null, name, '',
      `${pct(fb)} of residents were born outside the U.S. Top places of birth, as a share of foreign-born residents:`);
  }

  function languageChart(entity, compare, name, compareName) {
    if (!entity.languages?.length) return '';
    const cmap = Object.fromEntries((compare?.languages || []).map(([n, v]) => [n, v]));
    return barChart('Language spoken at home', entity.languages.map((l) => l[0]), entity.languages.map((l) => l[1]),
      entity.languages.map((l) => cmap[l[0]] ?? null), name, compareName, 'Residents 5 and older.');
  }

  function highlights(h) {
    const out = [];
    const n = S.data.meta.rank_n, bn = S.data.meta.brank_n[h.borough] || {};
    for (const s of STATS) {
      if (!s.hl || h.rank?.[s.key] == null) continue;
      const r = h.rank[s.key], N = n[s.key], br = h.brank?.[s.key], BN = bn[s.key];
      let text = null, score = 0;
      if (r <= 3) { text = `${r === 1 ? 'Highest' : ordinal(r) + ' highest'} ${s.hl} in the city`; score = 10 - r; }
      else if (r > N - 3) { const k = N - r + 1; text = `${k === 1 ? 'Lowest' : ordinal(k) + ' lowest'} ${s.hl} in the city`; score = 10 - k; }
      else if (br === 1) { text = `Highest ${s.hl} in ${h.borough}`; score = 5; }
      else if (BN && br === BN) { text = `Lowest ${s.hl} in ${h.borough}`; score = 5; }
      if (text) out.push({ text, score, key: s.key });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 6);
  }

  function statsTable(cols) {
    // cols: [{name, entity, rank?:bool}]
    let html = `<div class="tblwrap"><table class="tbl"><thead><tr><th>Measure</th>${cols.map((c) => `<th>${esc(c.name)}</th>`).join('')}</tr></thead><tbody>`;
    let group = '';
    for (const s of STATS) {
      if (s.group !== group) { group = s.group; html += `<tr class="group"><td colspan="${cols.length + 1}">${esc(group)}</td></tr>`; }
      html += `<tr><td><a href="#/rankings/${s.key}">${esc(s.label)}</a></td>` + cols.map((c) => {
        if (c.rank) {
          const r = c.entity.rank?.[s.key];
          return `<td class="muted">${r ? `${ordinal(r)} / ${S.data.meta.rank_n[s.key]}` : '—'}</td>`;
        }
        return `<td>${fmt(s.key, c.entity.stats[s.key])}</td>`;
      }).join('') + '</tr>';
    }
    return html + '</tbody></table></div>';
  }

  function hoodLink(id) {
    const h = S.data.neighborhoods[id];
    return `<a class="chip" href="#/neighborhood/${h.slug}">${esc(h.name)}</a>`;
  }

  function statOptions(selected, { includeNone = false } = {}) {
    let html = includeNone ? `<option value="">Neighborhoods (no data)</option>` : '';
    let group = '';
    for (const s of STATS) {
      if (s.nomap) continue;
      if (s.group !== group) { if (group) html += '</optgroup>'; group = s.group; html += `<optgroup label="${esc(group)}">`; }
      html += `<option value="${s.key}" ${s.key === selected ? 'selected' : ''}>${esc(s.label)}</option>`;
    }
    return html + '</optgroup>';
  }

  // ------------------------------------------------------------------------ //
  // Pages
  // ------------------------------------------------------------------------ //
  function pageHome() {
    const d = S.data;
    S.selected = null; S.highlight = new Set();
    setLabels([]);
    map.flyToBounds(S.cityBounds, { padding: [10, 10], duration: 0.6 });
    const boros = d.meta.boroughs.map((b) => {
      const B = d.boroughs[b];
      const members = S.hoods.filter((h) => h.borough === b && h.residential);
      return `<details class="boro"><summary><h3><a href="#/borough/${B.slug}">${esc(b)}</a></h3><span>${members.length} neighborhoods · ${fmt('population', B.stats.population)} people</span></summary>
        <ul>${members.map((h) => `<li><a href="#/neighborhood/${h.slug}">${esc(h.name)}</a></li>`).join('')}</ul></details>`;
    }).join('');
    return `<h1>New York City, neighborhood by neighborhood</h1>
      <p class="lede">Explore ${S.resCount} residential neighborhoods across the five boroughs: who lives there, what they earn, how they get around and how each place compares with the rest of the city.</p>
      <div class="tiles">${['population', 'median_income', 'median_age', 'diversity'].map((k) => tile(k, d.city)).join('')}</div>
      <h2>Start exploring</h2>
      <p class="dek">Pick a neighborhood on the map, search above, or browse by borough.</p>
      <div class="quick">
        <a class="chip" href="#/rankings/diversity">Most diverse</a>
        <a class="chip" href="#/rankings/density">Most crowded</a>
        <a class="chip" href="#/rankings/median_income">Highest income</a>
        <a class="chip" href="#/rankings/median_rent">Priciest rent</a>
        <a class="chip" href="#/rankings/pct_foreign_born">Most immigrants</a>
        <a class="chip" href="#/rankings/commute_min">Longest commutes</a>
      </div>
      <div class="boros">${boros}</div>`;
  }

  function pageNeighborhood(h) {
    const d = S.data;
    S.selected = h.id;
    S.highlight = new Set(h.neighbors);
    setLabels([h.id, ...h.neighbors]);
    const layer = layerById[h.id];
    if (layer) map.flyToBounds(L.featureGroup([layer, ...h.neighbors.map((n) => layerById[n]).filter(Boolean)]).getBounds(), { padding: [30, 30], duration: 0.6, maxZoom: 15 });
    const B = d.boroughs[h.borough];
    const crumbs = `<div class="crumbs"><a class="back-city" href="#/">← All of NYC</a> <span aria-hidden="true">·</span> <a href="#/borough/${B.slug}">${esc(h.borough)}</a></div>`;
    const neighbors = h.neighbors.length ? `<h2>Neighbors</h2><div class="chips">${h.neighbors.map(hoodLink).join('')}</div>` : '';

    if (!h.residential) {
      return `${crumbs}<h1>${esc(h.name)}</h1><p class="sub"><span class="badge">${esc(h.type)}</span>${esc(h.borough)}</p>
        <p class="lede">${esc(h.name)} is one of ${S.hoods.length - S.resCount} parks, cemeteries, airports and other special areas that NYC Planning maps separately from residential neighborhoods.
        ${h.stats.population ? `About ${fmt('population', h.stats.population)} people are counted here, too few for reliable statistics, so it isn't ranked.` : 'Nobody lives here, so it has no demographic profile.'}</p>
        <div class="tiles">${tile('area_sqmi', h)}</div>${neighbors}`;
    }

    const hl = highlights(h);
    return `${crumbs}<h1>${esc(h.name)}</h1>
      <p class="sub">${esc(h.borough)} · Community District ${esc(h.cd)}</p>
      <div class="tiles">${TILE_KEYS.map((k) => tile(k, h, d.city)).join('')}</div>
      ${hl.length ? `<h2>Highlights</h2><p class="dek">Compared with the city's ${S.resCount} residential neighborhoods.</p><ul class="highlights">${hl.map((x) => `<li><a href="#/rankings/${x.key}"><strong>${esc(x.text)}</strong></a>: ${fmt(x.key, h.stats[x.key])}</li>`).join('')}</ul>` : ''}
      ${distCharts(h, d.city, h.name, 'NYC')}
      ${birthplaceChart(h, h.name)}
      ${languageChart(h, d.city, h.name, 'NYC')}
      <h2>All the numbers</h2>
      <p class="dek">Ranks are out of ${S.resCount} residential neighborhoods; 1st is the highest value.</p>
      ${statsTable([{ name: h.name, entity: h }, { name: h.borough, entity: B }, { name: 'NYC', entity: d.city }, { name: 'Rank', entity: h, rank: true }])}
      ${neighbors}
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
    return `<div class="crumbs"><a class="back-city" href="#/">← All of NYC</a></div>
      <h1>${esc(B.name)}</h1>
      <p class="sub">${res.length} residential neighborhoods</p>
      <div class="tiles">${TILE_KEYS.map((k) => tile(k, B, d.city)).join('')}</div>
      <h2>Neighborhoods</h2>
      <p class="dek">Select a column to sort.</p>
      <div id="boro-table"></div>
      ${distCharts(B, d.city, B.name, 'NYC')}
      ${birthplaceChart(B, B.name)}
      ${languageChart(B, d.city, B.name, 'NYC')}
      <h2>All the numbers</h2>
      ${statsTable([{ name: B.name, entity: B }, { name: 'NYC', entity: d.city }])}
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

  function pageRankings(key, boro) {
    const s = STAT[key] || STAT.median_income;
    key = s.key;
    S.selected = null; S.highlight = new Set();
    setLabels([]);
    setLayer(key);
    const boroughs = S.data.meta.boroughs;
    const rows = S.hoods.filter((h) => h.residential && h.stats[key] != null && (!boro || h.borough === boro))
      .sort((a, b) => b.stats[key] - a.stats[key]);
    const members = boro ? S.hoods.filter((h) => h.borough === boro) : null;
    map.flyToBounds(members ? L.featureGroup(members.map((h) => layerById[h.id])).getBounds() : S.cityBounds, { padding: [20, 20], duration: 0.6 });
    const max = Math.max(...rows.map((h) => h.stats[key]));
    const boroSlug = (b) => S.data.boroughs[b].slug;
    return `<h1>Rankings</h1>
      <p class="lede">${S.resCount} residential neighborhoods, ranked. Parks, cemeteries and airports are left out.</p>
      <div class="controls">
        <label for="rank-select" class="sr-only">Measure</label>
        <select id="rank-select">${statOptions(key)}</select>
      </div>
      <div class="chips" role="group" aria-label="Filter by borough">
        <a class="chip" href="#/rankings/${key}" aria-pressed="${!boro}">All boroughs</a>
        ${boroughs.map((b) => `<a class="chip" href="#/rankings/${key}/${boroSlug(b)}" aria-pressed="${boro === b}">${esc(b)}</a>`).join('')}
      </div>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>Rank</th><th style="text-align:left">Neighborhood</th><th>${esc(s.label)}</th><th class="barcell"><span class="sr-only">Bar</span></th></tr></thead><tbody>
        ${rows.map((h) => `<tr class="click" data-slug="${h.slug}">
          <td class="muted">${boro ? h.brank[key] : h.rank[key]}</td>
          <td style="text-align:left"><a href="#/neighborhood/${h.slug}">${esc(h.name)}</a>${boro ? '' : ` <span class="muted" style="color:var(--muted)">${esc(h.borough)}</span>`}</td>
          <td>${fmt(key, h.stats[key])}</td>
          <td class="barcell"><div class="ibar" style="width:${max > 0 ? (h.stats[key] / max) * 100 : 0}%"></div></td></tr>`).join('')}
      </tbody></table></div>
      ${sourceNote()}`;
  }

  function pageAbout() {
    S.selected = null; S.highlight = new Set();
    setLabels([]);
    const m = S.data.meta;
    return `<div class="prose"><h1>About</h1>
      <p class="lede">Mapping NYC profiles every neighborhood in New York City, in the spirit of the Los Angeles Times' <em>Mapping L.A.</em> project.</p>
      <h2>Neighborhood boundaries</h2>
      <p>Neighborhoods are the city's 2020 Neighborhood Tabulation Areas (NTAs), drawn by the NYC Department of City Planning from whole census tracts. There are 262 of them: ${S.resCount} residential neighborhoods plus parks, cemeteries, airports and other special areas, which are mapped but not ranked. NTA names and lines don't always match what residents call home, and some combine several familiar neighborhoods.</p>
      <h2>Data</h2>
      <p>${esc(m.acs)}. Source: ${esc(m.acs_source)}. The American Community Survey is based on a sample, so every figure has a margin of error, which is larger for small groups and small neighborhoods. Treat small differences between neighborhoods as noise.</p>
      <ul>
        <li><strong>Diversity index</strong>: the chance that two residents picked at random are of different races or ethnicities (Latino, white, Black, Asian, other). 0 means everyone is the same; the maximum with five groups is 0.80.</li>
        <li><strong>Ranks</strong> compare the ${S.resCount} residential neighborhoods. 1st is the highest value, whether that's good or bad.</li>
        <li><strong>Medians</strong> for boroughs and the city${m.medians ? ' (and for neighborhoods, when data comes from the Census API)' : ''} are estimated from income, rent, value and age brackets.</li>
        <li><strong>Density</strong> uses land area within each boundary.</li>
      </ul>
      <h2>Sources</h2>
      <ul>
        <li><a href="https://www.nyc.gov/content/planning/pages/resources/datasets/neighborhood-tabulation" target="_blank" rel="noopener">2020 Neighborhood Tabulation Areas</a>, NYC Department of City Planning (via NYC Open Data)</li>
        <li>American Community Survey 5-year estimates by NTA, NYC Department of City Planning, Population Division</li>
        <li><a href="https://www.census.gov/data/developers/data-sets/acs-5year.html" target="_blank" rel="noopener">Census Bureau ACS API</a> (when live data is enabled)</li>
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
    const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    return { page: parts[0] || 'home', a: parts[1], b: parts[2] };
  }

  function render() {
    const panel = $('#panel');
    const r = parseRoute();
    const changed = JSON.stringify(r) !== JSON.stringify(S.route);
    const firstRender = !S.route;
    S.route = r;
    let html, title = 'Mapping NYC', nav = r.page, after = null;
    if (r.page !== 'rankings' && changed && S.layerKey && S.layerFromRanking) { setLayer(''); }
    S.layerFromRanking = false;

    if (r.page === 'neighborhood' && S.bySlug[r.a]) {
      const h = S.bySlug[r.a];
      html = pageNeighborhood(h); title = `${h.name}, ${h.borough} · Mapping NYC`; nav = 'home';
    } else if (r.page === 'borough' && S.boroBySlug[r.a]) {
      const B = S.boroBySlug[r.a];
      html = pageBorough(B); title = `${B.name} · Mapping NYC`; nav = 'home';
      after = () => mountBoroughTable(B);
    } else if (r.page === 'rankings') {
      const boro = r.b ? S.boroBySlug[r.b]?.name : null;
      html = pageRankings(r.a, boro); title = `Rankings: ${STAT[r.a]?.label || ''} · Mapping NYC`;
      S.layerFromRanking = true;
      after = () => $('#rank-select').addEventListener('change', (e) => { location.hash = `#/rankings/${e.target.value}${r.b ? '/' + r.b : ''}`; });
    } else if (r.page === 'about') {
      html = pageAbout(); title = 'About · Mapping NYC';
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
    const sel = $('#layer-select');
    sel.innerHTML = statOptions('', { includeNone: true });
    sel.addEventListener('change', () => { setLayer(sel.value); S.layerFromRanking = false; });
    initMap();
    wireSearch();
    wireChartTips();
    window.addEventListener('hashchange', render);
    render();
  }

  boot();
})();
