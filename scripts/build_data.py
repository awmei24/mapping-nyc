#!/usr/bin/env python3
"""Build the data files that power Mapping NYC.

Downloads (and caches):
  * 2020 Neighborhood Tabulation Area (NTA) boundaries - NYC Open Data
  * ACS 2018-2022 5-year estimates by NTA - NYC Department of City Planning
    (Demographic, Social, Economic and Housing profiles)

Writes:
  * data/neighborhoods.geojson  simplified boundaries with id/name/borough
  * data/stats.json             per-neighborhood stats, ranks, distributions,
                                neighbors, plus borough and citywide totals

Usage:
  python scripts/build_data.py [--cache scripts/.cache] [--out data]
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import math
import re
import urllib.request
from pathlib import Path

import pandas as pd
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

NTA_URL = "https://data.cityofnewyork.us/api/geospatial/9nt8-h7nd?method=export&format=GeoJSON"
TRACTS_URL = "https://data.cityofnewyork.us/api/views/63ge-mke6/rows.csv?accessType=DOWNLOAD"
ACS_BASE = "https://s-media.nyc.gov/agencies/dcp/assets/files/excel/data-tools/census/acs"
ACS_VINTAGE = "1822"  # 2018-2022 5-year estimates
ACS_TABLES = ["Dem", "Soc", "Econ", "Hous"]

BOROUGH_ORDER = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"]
NTA_TYPES = {
    0: "Residential",
    5: "Rikers Island",
    6: "Special area",
    7: "Cemetery",
    8: "Airport",
    9: "Park",
}

SQFT_PER_SQMI = 5280.0 ** 2


# --------------------------------------------------------------------------- #
# Download helpers
# --------------------------------------------------------------------------- #
def fetch(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 1000:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "mapping-nyc-build/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        f.write(r.read())
    return dest


def load_acs(cache: Path) -> tuple[pd.DataFrame, dict[str, str]]:
    """Return one wide frame (indexed by NTA code) of estimate columns plus a
    code->label map built from the data dictionaries."""
    frames, labels = [], {}
    for t in ACS_TABLES:
        path = fetch(f"{ACS_BASE}/{t}_{ACS_VINTAGE}_NTA.xlsx", cache / f"{t}_{ACS_VINTAGE}_NTA.xlsx")
        df = pd.read_excel(path, sheet_name=0)
        df = df.set_index("GeoID")
        est = {c[:-1]: df[c] for c in df.columns if c.endswith("E") and c[:-1] not in ("GeoTyp",)}
        frames.append(pd.DataFrame(est))
        dd = pd.read_excel(path, sheet_name="Data Dictionary", header=None)
        for row in dd.itertuples(index=False):
            vals = [v for v in row if isinstance(v, str)]
            if len(vals) >= 2 and re.fullmatch(r"[A-Za-z0-9_]+", vals[1].strip()):
                labels.setdefault(vals[1].strip(), vals[0].strip())
        meta = df[["GeogName", "Borough", "NTAType"]]
    acs = pd.concat(frames, axis=1)
    acs = acs.loc[:, ~acs.columns.duplicated()]
    acs = acs.apply(pd.to_numeric, errors="coerce")
    return acs.join(meta), labels


# --------------------------------------------------------------------------- #
# Stat helpers
# --------------------------------------------------------------------------- #
def num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def ratio(a, b):
    a, b = num(a), num(b)
    if a is None or not b:
        return None
    return a / b


def interp_median(bins: list[tuple[float, float | None, float]]) -> float | None:
    """Linear-interpolated median from (lower, upper, count) bins."""
    total = sum(c for _, _, c in bins)
    if total <= 0:
        return None
    half, run = total / 2.0, 0.0
    for lo, hi, c in bins:
        if run + c >= half and c > 0:
            if hi is None:
                return lo
            return lo + (half - run) / c * (hi - lo)
        run += c
    return None


INCOME_BINS = [  # code, lower, upper
    ("HHIU10", 0, 10000), ("HHI10t14", 10000, 15000), ("HHI15t24", 15000, 25000),
    ("HHI25t34", 25000, 35000), ("HHI35t49", 35000, 50000), ("HHI50t74", 50000, 75000),
    ("HHI75t99", 75000, 100000), ("HI100t149", 100000, 150000),
    ("HI150t199", 150000, 200000), ("HHI200pl", 200000, None),
]
AGE_BINS = [
    ("PopU5", 0, 5), ("Pop5t9", 5, 10), ("Pop10t14", 10, 15), ("Pop15t19", 15, 20),
    ("Pop20t24", 20, 25), ("Pop25t29", 25, 30), ("Pop30t34", 30, 35), ("Pop35t39", 35, 40),
    ("Pop40t44", 40, 45), ("Pop45t49", 45, 50), ("Pop50t54", 50, 55), ("Pop55t59", 55, 60),
    ("Pop60t64", 60, 65), ("Pop65t69", 65, 70), ("Pop70t74", 70, 75), ("Pop75t79", 75, 80),
    ("Pop80t84", 80, 85), ("Pop85pl", 85, None),
]
RENT_BINS = [
    ("GRU500", 0, 500), ("GR500t999", 500, 1000), ("GR1kt14k", 1000, 1500),
    ("GR15kt19k", 1500, 2000), ("GR20kt24k", 2000, 2500), ("GR25kt29k", 2500, 3000),
    ("GR3kpl", 3000, None),
]
VALUE_BINS = [
    ("VlU50", 0, 50000), ("Vl50t99", 50000, 100000), ("Vl100t149", 100000, 150000),
    ("Vl150t199", 150000, 200000), ("Vl200t299", 200000, 300000),
    ("Vl300t499", 300000, 500000), ("Vl500t999", 500000, 1000000), ("Vl1milpl", 1000000, None),
]

# Distributions shown as bar charts: (key, title, universe code, [(label, [codes])])
DISTRIBUTIONS = [
    ("ethnicity", "Race & ethnicity", "Pop_2", [
        ("Latino", ["Hsp1"]),
        ("White", ["WtNH"]),
        ("Black", ["BlNH"]),
        ("Asian", ["AsnNH"]),
        ("Other / multiracial", ["AIANNH", "NHPINH", "OthNH", "Rc2plNH"]),
    ]),
    ("age", "Age", "Pop_1", [
        ("Under 10", ["PopU5", "Pop5t9"]),
        ("10 to 19", ["Pop10t14", "Pop15t19"]),
        ("20 to 34", ["Pop20t24", "Pop25t29", "Pop30t34"]),
        ("35 to 49", ["Pop35t39", "Pop40t44", "Pop45t49"]),
        ("50 to 64", ["Pop50t54", "Pop55t59", "Pop60t64"]),
        ("65 and older", ["Pop65t69", "Pop70t74", "Pop75t79", "Pop80t84", "Pop85pl"]),
    ]),
    ("income", "Household income", "HH2", [
        ("Under $25k", ["HHIU10", "HHI10t14", "HHI15t24"]),
        ("$25k to $50k", ["HHI25t34", "HHI35t49"]),
        ("$50k to $75k", ["HHI50t74"]),
        ("$75k to $100k", ["HHI75t99"]),
        ("$100k to $150k", ["HI100t149"]),
        ("$150k to $200k", ["HI150t199"]),
        ("$200k or more", ["HHI200pl"]),
    ]),
    ("education", "Education (adults 25+)", "EA_P25pl", [
        ("Less than high school", ["EA_LTHSGr"]),
        ("High school diploma", ["EA_HScGrd"]),
        ("Some college / associate's", ["EA_SClgND", "EA_AscD"]),
        ("Bachelor's degree", ["EA_BchD"]),
        ("Graduate degree", ["EA_GrdPfD"]),
    ]),
    ("commute", "How people get to work", "Wrkr16pl", [
        ("Public transit", ["CW_PbTrns"]),
        ("Drove alone", ["CW_DrvAln"]),
        ("Carpooled", ["CW_Crpld"]),
        ("Walked", ["CW_Wlkd"]),
        ("Worked from home", ["CW_WrkdHm"]),
        ("Other", ["CW_Oth"]),
    ]),
    ("housing_age", "When homes were built", "HU3", [
        ("Before 1940", ["BltBf39"]),
        ("1940 to 1969", ["Blt40t49", "Blt50t59", "Blt60t69"]),
        ("1970 to 1999", ["Blt70t79", "Blt80t89", "Blt90t99"]),
        ("2000 to 2009", ["Blt00t09"]),
        ("2010 or later", ["Blt10Ltr"]),
    ]),
    ("building_size", "Homes by building size", "HU2", [
        ("Single-family", ["HU1uD", "HU1uA"]),
        ("2 to 4 units", ["HU2u", "HU3t4u"]),
        ("5 to 19 units", ["HU5t9u", "HU10t19u"]),
        ("20 or more units", ["HU20plu"]),
    ]),
]

# Birthplace codes that are regional subtotals or "other" buckets, not countries.
BIRTHPLACE_AGGREGATES = {
    "Fb1", "Fb2", "Fb3", "Eur", "NEur", "UKnoEngSc", "Eng", "Scot", "ONEur", "WEur", "OWEur",
    "SEur", "Azores", "OSEur", "EEur", "OEEur", "EurNEC", "Asia", "EAsia", "ChNoHKTwn",
    "HongKong", "Taiwan", "OEAsia", "SCAsia", "OSCAsia", "SEAsia", "OSEAsia", "WAsia", "OWAsia",
    "AsiaNEC", "Afr", "EAfr", "OEAfr", "MAfr", "OMAfr", "NAfr", "ONAfr", "SthrnAfr", "OSthrnAfr",
    "WAfr", "OWAfr", "AfrNEC", "Oceania", "AusNZSbR", "OAusNZSbR", "OcniaNEC", "Amricas", "LAm",
    "Carib", "OCarib", "CAm", "OCAm", "SAm", "OSAm", "NAm", "ONAm",
}
BIRTHPLACE_RENAME = {"Korea": "Korea", "WIndies": "West Indies (other)", "UntdKgdm": "United Kingdom",
                     "Czchslv": "Czechoslovakia (former)", "DomRep": "Dominican Republic",
                     "Mcdonia": "North Macedonia"}

LANGUAGES = [
    ("Spanish", "LgSp1"), ("Chinese", "LgChi1"), ("Russian, Polish & other Slavic", "LgRusPol1"),
    ("French & Haitian Creole", "LgFr1"), ("Other Indo-European", "LgOIEu1"), ("Korean", "LgKor1"),
    ("Tagalog", "LgTag1"), ("Vietnamese", "LgViet1"), ("German & West Germanic", "LgGrm1"),
    ("Arabic", "LgArab1"), ("Other Asian & Pacific", "LgOAsn1"), ("Other languages", "LgOLg1"),
]


def sum_codes(row, codes):
    vals = [num(row.get(c)) for c in codes]
    vals = [v for v in vals if v is not None]
    return sum(vals) if vals else None


def compute_stats(row: dict, area_sqmi: float, exact_medians: bool) -> dict:
    """Headline stats for one geography. `row` maps ACS codes to estimates.
    For aggregates (boroughs/city) medians are interpolated from bins."""
    g = lambda c: num(row.get(c))  # noqa: E731
    pop = g("Pop_1") or 0
    eth = [g("Hsp1"), g("WtNH"), g("BlNH"), g("AsnNH")]
    pop2 = g("Pop_2")
    diversity = None
    if pop2 and all(v is not None for v in eth):
        other = max(pop2 - sum(eth), 0)
        shares = [v / pop2 for v in eth + [other]]
        diversity = 1 - sum(s * s for s in shares)

    def med(code, bins):
        if exact_medians:
            return g(code)
        return interp_median([(lo, hi, g(c) or 0) for c, lo, hi in bins])

    s = {
        "population": pop,
        "area_sqmi": area_sqmi,
        "density": pop / area_sqmi if area_sqmi else None,
        "median_age": med("MdAge", AGE_BINS),
        "median_income": med("MdHHInc", INCOME_BINS),
        "per_capita_income": g("PerCapInc") if exact_medians else None,
        "diversity": diversity,
        "pct_latino": ratio(g("Hsp1"), pop2),
        "pct_white": ratio(g("WtNH"), pop2),
        "pct_black": ratio(g("BlNH"), pop2),
        "pct_asian": ratio(g("AsnNH"), pop2),
        "pct_foreign_born": ratio(g("Fb1"), g("Pop_4")),
        "pct_bachelors": ratio(g("EA_BchDH"), g("EA_P25pl")),
        "pct_renters": ratio(g("ROcHU1"), g("OcHU2")),
        "median_rent": med("MdGR", RENT_BINS),
        "median_home_value": med("MdVl", VALUE_BINS),
        "pct_rent_burdened": ratio(g("GRPI30pl"), g("OcHUPRnt2")),
        "pct_poverty": ratio(g("PBwPv"), g("PopPvU1")),
        "pct_unemployed": ratio(g("CvLFUEm1"), g("CvLF1")),
        "pct_no_insurance": ratio(g("NHIns"), g("CvNIPop2")),
        "pct_no_car": ratio(g("NoVhclAv"), g("OcHU4")),
        "pct_transit": ratio(g("CW_PbTrns"), g("Wrkr16pl")),
        "pct_wfh": ratio(g("CW_WrkdHm"), g("Wrkr16pl")),
        "commute_min": g("MnTrvTm"),
        "avg_hh_size": ratio(g("HHPop"), g("HH1")),
        "pct_living_alone": ratio(g("NFamA"), g("HH1")),
        "pct_single_parent": ratio(sum_codes(row, ["MHnSChU18", "FHnSChU18"]), g("FamChU18")),
        "pct_under18": ratio(g("PopU181"), pop),
        "pct_65plus": ratio(g("Pop65pl1"), pop),
        "pct_veterans": ratio(g("CvVet18pl"), g("CvPop18pl")),
        "pct_limited_english": ratio(g("LgOEnLEP1"), g("Pop5pl1")),
        "pct_pre1940": ratio(g("BltBf39"), g("HU3")),
    }
    return s


def distributions(row: dict) -> dict:
    out = {}
    for key, _title, universe, groups in DISTRIBUTIONS:
        tot = num(row.get(universe))
        if not tot:
            continue
        out[key] = [round((sum_codes(row, codes) or 0) / tot, 4) for _, codes in groups]
    return out


def birthplaces(row: dict, codes: list[str], labels: dict[str, str], top: int = 6) -> list:
    fb = num(row.get("Fb1"))
    if not fb:
        return []
    items = []
    for c in codes:
        v = num(row.get(c))
        if v and v > 0:
            name = BIRTHPLACE_RENAME.get(c, labels.get(c, c)).strip()
            items.append((name, v))
    items.sort(key=lambda x: -x[1])
    return [[n, round(v), round(v / fb, 4)] for n, v in items[:top]]


def languages(row: dict) -> list:
    pop5 = num(row.get("Pop5pl1"))
    if not pop5:
        return []
    out = [["English only", round((num(row.get("EngOnly1")) or 0) / pop5, 4)]]
    langs = [(n, num(row.get(c))) for n, c in LANGUAGES if num(row.get(c))]
    langs.sort(key=lambda x: -x[1])
    out += [[n, round(v / pop5, 4)] for n, v in langs[:4]]
    return out


def round_stats(s: dict) -> dict:
    out = {}
    for k, v in s.items():
        if v is None:
            out[k] = None
        elif k.startswith("pct_") or k == "diversity":
            out[k] = round(v, 4)
        elif k in ("area_sqmi", "avg_hh_size", "median_age", "commute_min"):
            out[k] = round(v, 2)
        else:
            out[k] = round(v)
    return out


def slugify(text: str) -> str:
    s = text.lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


# --------------------------------------------------------------------------- #
# Geometry
# --------------------------------------------------------------------------- #
def round_coords(geom_json, nd=5):
    def r(c):
        if isinstance(c[0], (int, float)):
            return [round(c[0], nd), round(c[1], nd)]
        return [r(x) for x in c]
    geom_json["coordinates"] = r(geom_json["coordinates"])
    return geom_json


def main():
    ap = argparse.ArgumentParser()
    root = Path(__file__).resolve().parent.parent
    ap.add_argument("--cache", type=Path, default=root / "scripts" / ".cache")
    ap.add_argument("--out", type=Path, default=root / "data")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    print("Loading boundaries")
    gj = json.loads(fetch(NTA_URL, args.cache / "nta2020.geojson").read_text())
    print("Loading ACS tables")
    acs, labels = load_acs(args.cache)
    acs_cols = list(acs.columns)
    try:
        bp_codes = acs_cols[acs_cols.index("Eur"): acs_cols.index("Fb3")]
    except ValueError:
        bp_codes = []
    bp_codes = [c for c in bp_codes if c not in BIRTHPLACE_AGGREGATES]

    # ---- geometry, neighbors -------------------------------------------- #
    geoms, props = {}, {}
    for f in gj["features"]:
        p = f["properties"]
        code = p["nta2020"]
        geoms[code] = shape(f["geometry"])
        props[code] = p
    codes = sorted(geoms)

    print("Computing neighbors")
    # Two areas are neighbors when they share a meaningful stretch of border.
    # Borough lines run through the rivers, so cross-borough pairs need a
    # much longer shared edge (otherwise Greenpoint "borders" Murray Hill).
    buffered = {c: geoms[c].buffer(0.0003) for c in codes}
    neighbors = {c: [] for c in codes}
    for i, a in enumerate(codes):
        for b in codes[i + 1:]:
            if not buffered[a].intersects(buffered[b]):
                continue
            shared = geoms[a].boundary.intersection(buffered[b]).length
            same_boro = props[a]["borocode"] == props[b]["borocode"]
            if shared > (0.0008 if same_boro else 0.004):
                neighbors[a].append(b)
                neighbors[b].append(a)

    # ---- names & slugs --------------------------------------------------- #
    slugs, seen = {}, {}
    for c in codes:
        base = slugify(props[c]["ntaname"])
        if base in seen:
            base = f"{base}-{slugify(props[c]['boroname'])}"
        seen[base] = c
        slugs[c] = base

    # ---- per-NTA stats --------------------------------------------------- #
    print("Computing stats")
    hoods = {}
    for c in codes:
        p = props[c]
        row = acs.loc[c].to_dict() if c in acs.index else {}
        area = float(p["shape_area"]) / SQFT_PER_SQMI
        ntype = int(p["ntatype"])
        s = compute_stats(row, area, exact_medians=True)
        rp = geoms[c].representative_point()
        hoods[c] = {
            "id": c,
            "slug": slugs[c],
            "name": p["ntaname"],
            "borough": p["boroname"],
            "cd": re.sub(r"\s*\(.*\)$", "", p.get("cdtaname", "")).strip(),
            "type": NTA_TYPES.get(ntype, "Special area"),
            "residential": ntype == 0,
            "center": [round(rp.y, 5), round(rp.x, 5)],
            "neighbors": sorted(neighbors[c], key=lambda n: props[n]["ntaname"]),
            "stats": round_stats(s),
            "dist": distributions(row) if s["population"] else {},
            "birthplaces": birthplaces(row, bp_codes, labels),
            "languages": languages(row),
        }

    # ---- ranks among residential neighborhoods --------------------------- #
    res = [c for c in codes if hoods[c]["residential"]]
    stat_keys = list(next(iter(hoods.values()))["stats"].keys())
    for k in stat_keys:
        vals = [(hoods[c]["stats"][k], c) for c in res if hoods[c]["stats"][k] is not None]
        vals.sort(key=lambda x: -x[0])
        for i, (_, c) in enumerate(vals):
            hoods[c].setdefault("rank", {})[k] = i + 1
        for b in BOROUGH_ORDER:
            bvals = [(v, c) for v, c in vals if hoods[c]["borough"] == b]
            for i, (_, c) in enumerate(bvals):
                hoods[c].setdefault("brank", {})[k] = i + 1
    rank_n = {k: sum(1 for c in res if hoods[c]["stats"][k] is not None) for k in stat_keys}
    brank_n = {
        b: {k: sum(1 for c in res if hoods[c]["borough"] == b and hoods[c]["stats"][k] is not None)
            for k in stat_keys}
        for b in BOROUGH_ORDER
    }

    # ---- borough & city aggregates -------------------------------------- #
    print("Computing borough and city totals")
    count_cols = [c for c in acs.columns if c not in ("GeogName", "Borough", "NTAType")]

    def aggregate(code_list):
        sub = acs.loc[[c for c in code_list if c in acs.index], count_cols]
        row = sub.sum(numeric_only=True).to_dict()
        # Mean travel time: worker-weighted average of NTA means
        w = sub["Wrkr16pl"].fillna(0)
        row["MnTrvTm"] = float((sub["MnTrvTm"].fillna(0) * w).sum() / w.sum()) if w.sum() else None
        # Per-capita income: aggregate income / population
        pci = (sub["PerCapInc"].fillna(0) * sub["Pop_1"].fillna(0)).sum()
        area = sum(float(props[c]["shape_area"]) for c in code_list) / SQFT_PER_SQMI
        st = compute_stats(row, area, exact_medians=False)
        st["per_capita_income"] = pci / row["Pop_1"] if row.get("Pop_1") else None
        return {
            "stats": round_stats(st),
            "dist": distributions(row),
            "birthplaces": birthplaces(row, bp_codes, labels),
            "languages": languages(row),
        }

    boroughs = {}
    for b in BOROUGH_ORDER:
        members = [c for c in codes if hoods[c]["borough"] == b]
        boroughs[b] = {"name": b, "slug": slugify(b), "members": members, **aggregate(members)}
    city = {"name": "New York City", **aggregate(codes)}

    # ---- write ---------------------------------------------------------- #
    out = {
        "meta": {
            "acs": "American Community Survey 2018-2022 5-year estimates",
            "acs_source": "NYC Department of City Planning, Population Division",
            "boundaries": "2020 Neighborhood Tabulation Areas, NYC Department of City Planning",
            "dist_labels": {k: {"title": t, "labels": [g[0] for g in groups]}
                            for k, t, _u, groups in DISTRIBUTIONS},
            "rank_n": rank_n,
            "brank_n": brank_n,
            "boroughs": BOROUGH_ORDER,
        },
        "city": city,
        "boroughs": boroughs,
        "neighborhoods": hoods,
    }
    (args.out / "stats.json").write_text(json.dumps(out, separators=(",", ":")))

    features = []
    for c in codes:
        g = geoms[c].simplify(0.00008, preserve_topology=True)
        features.append({
            "type": "Feature",
            "properties": {"id": c, "name": props[c]["ntaname"], "borough": props[c]["boroname"],
                           "residential": hoods[c]["residential"]},
            "geometry": round_coords(mapping(g)),
        })
    # Borough outlines for the overview map
    for b in BOROUGH_ORDER:
        ug = unary_union([geoms[c] for c in codes if props[c]["boroname"] == b]).simplify(0.0002)
        features.append({"type": "Feature", "properties": {"borough_outline": b},
                         "geometry": round_coords(mapping(ug))})
    (args.out / "neighborhoods.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")))

    # Index used by the live Census API function (api/neighborhoods.js):
    # 2020 census tract GEOID -> NTA, plus NTA borough / residential / land area.
    csv.field_size_limit(sys.maxsize)
    tract_path = fetch(TRACTS_URL, args.cache / "tracts2020.csv")
    with open(tract_path, newline="") as fh:
        tracts = {r["GEOID"]: r["NTA2020"] for r in csv.DictReader(fh)}
    index = {
        "tracts": dict(sorted(tracts.items())),
        "ntas": {c: [hoods[c]["borough"], 1 if hoods[c]["residential"] else 0,
                     hoods[c]["stats"]["area_sqmi"]] for c in codes},
        "boroughs": BOROUGH_ORDER,
    }
    (args.out / "nta_index.json").write_text(json.dumps(index, separators=(",", ":")))

    for f in ("stats.json", "neighborhoods.geojson", "nta_index.json"):
        print(f"  wrote {args.out / f} ({(args.out / f).stat().st_size / 1024:.0f} KB)")
    print(f"Done: {len(codes)} areas, {len(res)} residential neighborhoods")


if __name__ == "__main__":
    main()
