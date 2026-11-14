#!/usr/bin/env python3
"""Build data/context.geojson: the land of New York, New Jersey and Connecticut
around the city, drawn under the neighborhoods so the map has some context.

Source: U.S. Census Bureau cartographic boundary counties (1:500k), which are
clipped to the shoreline. The five NYC counties are left out (the neighborhood
shapes cover them) and everything is clipped to a box a little larger than the
area the map lets you pan to.

Usage:
  python scripts/build_context.py [--cache scripts/.cache] [--out data]
"""
from __future__ import annotations

import argparse
import json
import urllib.request
import zipfile
from pathlib import Path

import shapefile  # pyshp
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

COUNTY_URL = "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_county_500k.zip"
STATES = {"36": "New York", "34": "New Jersey", "09": "Connecticut"}
NYC_COUNTIES = {"36005", "36047", "36061", "36081", "36085"}
# lon/lat box comfortably beyond the map's pan limits (city bounds padded 40%)
CLIP = box(-75.2, 39.9, -72.8, 41.5)


def fetch(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 1000:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "mapping-nyc-build/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        f.write(r.read())
    return dest


def round_coords(geom_json, nd=5):
    def r(c):
        if isinstance(c[0], (int, float)):
            return [round(c[0], nd), round(c[1], nd)]
        return [r(x) for x in c]
    geom_json["coordinates"] = r(geom_json["coordinates"])
    return geom_json


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=Path(__file__).parent / ".cache")
    ap.add_argument("--out", type=Path, default=Path(__file__).parent.parent / "data")
    args = ap.parse_args()

    zpath = fetch(COUNTY_URL, args.cache / Path(COUNTY_URL).name)
    unzipped = args.cache / zpath.stem
    if not unzipped.exists():
        with zipfile.ZipFile(zpath) as z:
            z.extractall(unzipped)

    parts: dict[str, list] = {fp: [] for fp in STATES}
    with shapefile.Reader(str(unzipped / zpath.stem)) as shp:
        for sr in shp.iterShapeRecords():
            rec = sr.record.as_dict()
            if rec["STATEFP"] not in STATES or rec["GEOID"] in NYC_COUNTIES:
                continue
            g = shape(sr.shape.__geo_interface__)
            if g.intersects(CLIP):
                parts[rec["STATEFP"]].append(g.intersection(CLIP))

    features = []
    for fp, geoms in parts.items():
        g = unary_union(geoms).simplify(0.0002, preserve_topology=True)
        if g.is_empty:
            continue
        features.append({"type": "Feature", "properties": {"state": STATES[fp]},
                         "geometry": round_coords(mapping(g))})
    out = args.out / "context.geojson"
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")))
    print(f"  wrote {out} ({out.stat().st_size / 1024:.0f} KB, {len(features)} states)")


if __name__ == "__main__":
    main()
