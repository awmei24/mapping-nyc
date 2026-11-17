#!/usr/bin/env python3
"""Build data/subway.geojson: subway lines and stations, drawn over the map.

Source: MTA New York City Transit static GTFS feed (subway + Staten Island
Railway). Track geometry comes from shapes.txt and the official route colors
from routes.txt.

Output features:
  * kind "line": one MultiLineString per trunk color (e.g. all the blue
    A/C/E track), with the routes that run on it
  * kind "station": one point per station complex entrance group (GTFS parent
    station), with its name and the routes that stop there

Usage:
  python scripts/build_subway.py [--cache scripts/.cache] [--out data]
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

from shapely.geometry import LineString, MultiLineString, mapping
from shapely.ops import linemerge, unary_union

GTFS_URL = "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip"
# Express and shuttle variants are shown under the name riders use.
ROUTE_ALIAS = {"FX": "F", "6X": "6", "7X": "7", "GS": "S", "FS": "S", "H": "S", "SI": "SIR"}
ROUTE_ORDER = "1 2 3 4 5 6 7 A C E B D F M G J Z L N Q R W S SIR".split()
SIMPLIFY = 0.00004  # degrees, ~4 m


def fetch(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 1000:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "mapping-nyc-build/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        f.write(r.read())
    return dest


def rows(z: zipfile.ZipFile, name: str):
    with z.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))


def rnd(geom, nd=5):
    """GeoJSON mapping with coordinates rounded to ~1 m."""
    def r(c):
        return [round(c[0], nd), round(c[1], nd)]
    m = mapping(geom)
    if m["type"] == "LineString":
        m["coordinates"] = [r(c) for c in m["coordinates"]]
    elif m["type"] == "MultiLineString":
        m["coordinates"] = [[r(c) for c in line] for line in m["coordinates"]]
    elif m["type"] == "Point":
        m["coordinates"] = r(m["coordinates"])
    return m


def sort_routes(names):
    return sorted(set(names), key=lambda n: ROUTE_ORDER.index(n) if n in ROUTE_ORDER else 99)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default="scripts/.cache")
    ap.add_argument("--out", default="data")
    args = ap.parse_args()

    z = zipfile.ZipFile(fetch(GTFS_URL, Path(args.cache) / "gtfs_subway.zip"))
    feed = next(rows(z, "feed_info.txt"), {})

    routes = {r["route_id"]: r for r in rows(z, "routes.txt")}
    color_of = {rid: "#" + r["route_color"].upper() for rid, r in routes.items()}

    # Shapes used by each route (one direction is enough: both run on the same track)
    trip_route, route_shapes = {}, defaultdict(set)
    for t in rows(z, "trips.txt"):
        trip_route[t["trip_id"]] = t["route_id"]
        if t.get("shape_id") and t.get("direction_id", "0") == "0":
            route_shapes[t["route_id"]].add(t["shape_id"])

    pts = defaultdict(list)
    for p in rows(z, "shapes.txt"):
        pts[p["shape_id"]].append((int(p["shape_pt_sequence"]), float(p["shape_pt_lon"]), float(p["shape_pt_lat"])))
    shapes = {sid: LineString([(x, y) for _, x, y in sorted(v)]) for sid, v in pts.items() if len(v) > 1}

    # One feature per trunk color: union the shapes so shared track is drawn once
    by_color = defaultdict(lambda: {"lines": [], "routes": set()})
    for rid, sids in route_shapes.items():
        g = by_color[color_of[rid]]
        g["routes"].add(ROUTE_ALIAS.get(rid, rid))
        g["lines"].extend(shapes[s] for s in sids if s in shapes)

    features = []
    for color, g in by_color.items():
        if not g["lines"]:
            continue
        merged = linemerge(unary_union(g["lines"]))
        merged = merged.simplify(SIMPLIFY, preserve_topology=False)
        if merged.geom_type == "LineString":
            merged = MultiLineString([merged])
        features.append({
            "type": "Feature",
            "properties": {"kind": "line", "color": color, "routes": sort_routes(g["routes"])},
            "geometry": rnd(merged),
        })
    # Draw the shuttles' gray first so trunk colors sit on top where they meet
    features.sort(key=lambda f: (f["properties"]["color"] != "#7C858C", f["properties"]["routes"][0] == "SIR"))

    # Stations: parent stops, with the routes whose trips stop at their platforms
    stops = {s["stop_id"]: s for s in rows(z, "stops.txt")}
    parent = {sid: (s["parent_station"] or sid) for sid, s in stops.items()}
    serves = defaultdict(set)
    seen = set()
    for st in rows(z, "stop_times.txt"):
        key = (st["trip_id"].rsplit("_", 1)[-1], st["stop_id"])  # pattern suffix keeps this small
        if key in seen:
            continue
        seen.add(key)
        rid = trip_route.get(st["trip_id"])
        if rid:
            serves[parent.get(st["stop_id"], st["stop_id"])].add(ROUTE_ALIAS.get(rid, rid))

    # Join stations linked by in-system transfers into one complex (Times Sq, Fulton St, …)
    root = {}

    def find(a):
        while root.get(a, a) != a:
            a = root[a]
        return a

    for t in rows(z, "transfers.txt"):
        a, b = parent.get(t["from_stop_id"]), parent.get(t["to_stop_id"])
        if a and b and a != b:
            root[find(a)] = find(b)
    complexes = defaultdict(list)
    for sid, s in stops.items():
        if s.get("location_type") == "1" and serves.get(sid):
            complexes[find(sid)].append(sid)

    n_stations = 0
    for members in complexes.values():
        n_stations += 1
        all_routes = set().union(*(serves[m] for m in members))
        # Name it after the busiest platform group; place it at their average position
        main = max(members, key=lambda m: len(serves[m]))
        lon = sum(float(stops[m]["stop_lon"]) for m in members) / len(members)
        lat = sum(float(stops[m]["stop_lat"]) for m in members) / len(members)
        features.append({
            "type": "Feature",
            "properties": {"kind": "station", "name": stops[main]["stop_name"], "routes": sort_routes(all_routes)},
            "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]},
        })

    route_colors = {}
    for rid, r in routes.items():
        name = ROUTE_ALIAS.get(rid, rid)
        route_colors.setdefault(name, {"color": color_of[rid], "text": "#" + r["route_text_color"].upper()})

    out = {
        "type": "FeatureCollection",
        "meta": {
            "source": "MTA New York City Transit GTFS",
            "feed_version": feed.get("feed_version", ""),
            "route_colors": {k: route_colors[k] for k in sort_routes(route_colors)},
        },
        "features": features,
    }
    dest = Path(args.out) / "subway.geojson"
    dest.write_text(json.dumps(out, separators=(",", ":")))
    print(f"  wrote {dest} ({dest.stat().st_size / 1024:.0f} KB): "
          f"{sum(f['properties']['kind'] == 'line' for f in features)} line groups, {n_stations} stations")


if __name__ == "__main__":
    main()
