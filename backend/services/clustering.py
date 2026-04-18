"""
Geography-first clustering for multi-day trip spreading.

Algorithm:
  1. estimate_num_days — compute minimum days needed from total activity hours.
  2. cluster_by_geography — k-medoids on lat/lng, assigns each place to a day bucket.
  3. balance_day_loads — post-clustering pass to move overflow places to lighter days.
"""

from __future__ import annotations
import math
from models import Place

FLAT_TRAVEL_MINUTES = 25  # pessimistic average used for day estimation


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in kilometres between two lat/lng points."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _day_capacity_hours(day_start: float, day_end: float) -> float:
    """Available hours per day minus a conservative travel buffer."""
    raw = day_end - day_start
    # Reserve 20% of the day for travel
    return raw * 0.80


def estimate_num_days(
    places: list[Place],
    day_start: float,
    day_end: float,
    avg_travel_minutes: float = FLAT_TRAVEL_MINUTES,
) -> int:
    """
    Minimum days needed to fit all places.
    Accounts for per-place activity duration plus per-place travel overhead.
    """
    if not places:
        return 1
    total_activity = sum(p.duration for p in places)
    total_travel = len(places) * (avg_travel_minutes / 60)
    total_hours = total_activity + total_travel
    capacity = _day_capacity_hours(day_start, day_end)
    return max(1, math.ceil(total_hours / capacity))


def _centroid(places: list[Place]) -> tuple[float, float]:
    """Average lat/lng of places that have coordinates."""
    coords = [(p.lat, p.lng) for p in places if p.lat is not None and p.lng is not None]
    if not coords:
        return (0.0, 0.0)
    return (sum(c[0] for c in coords) / len(coords), sum(c[1] for c in coords) / len(coords))


def cluster_by_geography(
    places: list[Place],
    num_days: int,
) -> list[list[Place]]:
    """
    Assign places to day buckets using iterative k-means on lat/lng.
    Places without coordinates go to the day with the most remaining capacity.

    Returns a list of `num_days` buckets (some may be empty for very small lists).
    """
    if num_days <= 1 or not places:
        return [list(places)]

    geo_places = [p for p in places if p.lat is not None and p.lng is not None]
    no_coord_places = [p for p in places if p.lat is None or p.lng is None]

    if not geo_places:
        # No coordinates at all — split evenly
        buckets: list[list[Place]] = [[] for _ in range(num_days)]
        for i, p in enumerate(places):
            buckets[i % num_days].append(p)
        return buckets

    # Seed centroids: pick evenly spaced places sorted by longitude (west→east)
    sorted_geo = sorted(geo_places, key=lambda p: p.lng or 0)
    step = max(1, len(sorted_geo) // num_days)
    centroids: list[tuple[float, float]] = []
    for i in range(num_days):
        idx = min(i * step, len(sorted_geo) - 1)
        centroids.append((sorted_geo[idx].lat or 0.0, sorted_geo[idx].lng or 0.0))

    # Iterative k-means (max 20 iterations)
    assignments: list[int] = [0] * len(geo_places)
    for _ in range(20):
        new_assignments = []
        for p in geo_places:
            dists = [
                haversine_km(p.lat or 0.0, p.lng or 0.0, clat, clng)
                for clat, clng in centroids
            ]
            new_assignments.append(dists.index(min(dists)))
        if new_assignments == assignments:
            break
        assignments = new_assignments
        # Recompute centroids
        for day_idx in range(num_days):
            day_places = [geo_places[i] for i, a in enumerate(assignments) if a == day_idx]
            if day_places:
                centroids[day_idx] = _centroid(day_places)

    # Build buckets from final assignments
    buckets = [[] for _ in range(num_days)]
    for i, p in enumerate(geo_places):
        buckets[assignments[i]].append(p)

    # Assign no-coord places to the lightest bucket (fewest total hours)
    for p in no_coord_places:
        lightest = min(range(num_days), key=lambda d: sum(x.duration for x in buckets[d]))
        buckets[lightest].append(p)

    return buckets


def balance_day_loads(
    buckets: list[list[Place]],
    day_start: float,
    day_end: float,
) -> list[list[Place]]:
    """
    Post-clustering pass: move places from overloaded days to underloaded ones.
    A day is "overloaded" if its total activity hours exceed 90% of capacity.
    Moves the geographically closest place to the centroid of the target day.
    Does not move pinned places (fixed_start set).
    """
    capacity = _day_capacity_hours(day_start, day_end)
    num_days = len(buckets)

    if num_days <= 1:
        return buckets

    changed = True
    iterations = 0
    while changed and iterations < num_days * 2:
        changed = False
        iterations += 1
        for src in range(num_days):
            src_hours = sum(p.duration for p in buckets[src])
            if src_hours <= capacity * 0.90:
                continue
            # Find the least-loaded day that isn't src
            candidates = [d for d in range(num_days) if d != src]
            if not candidates:
                continue
            dst = min(
                candidates,
                key=lambda d: sum(p.duration for p in buckets[d]),
            )
            dst_hours = sum(p.duration for p in buckets[dst])
            if dst_hours >= src_hours:
                continue  # Can't balance further
            # Find best candidate to move: not pinned, geographically closest to dst centroid
            dst_centroid = _centroid(buckets[dst])
            candidates = [p for p in buckets[src] if p.fixed_start is None]
            if not candidates:
                continue
            def geo_dist(p: Place) -> float:
                if p.lat is None or p.lng is None:
                    return 999999.0
                return haversine_km(p.lat, p.lng, dst_centroid[0], dst_centroid[1])
            best = min(candidates, key=geo_dist)
            buckets[src].remove(best)
            buckets[dst].append(best)
            changed = True

    return buckets
