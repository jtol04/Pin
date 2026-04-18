"""
Food crawl detection: identify clusters of food-category stops within close
travel proximity on the same day and surface them as suggestions.
"""

from __future__ import annotations
from models import DayItinerary, FoodCrawlSuggestion

FOOD_CATEGORY = "food"


def detect_food_crawls(
    days: list[DayItinerary],
    travel_matrices: list[list[list[int]]],  # per-day n×n matrices (minutes)
    threshold_minutes: int = 60,
) -> list[FoodCrawlSuggestion]:
    """
    For each day, find groups of 2+ food-category stops where every pairwise
    travel time (from the cached per-day matrix) is <= threshold_minutes.

    Returns a list of FoodCrawlSuggestion, one per qualifying cluster per day.
    """
    suggestions: list[FoodCrawlSuggestion] = []

    for day in days:
        slots = day.itinerary
        matrix = travel_matrices[day.day_index] if day.day_index < len(travel_matrices) else []

        # Indices of food stops within this day's itinerary
        food_indices = [i for i, s in enumerate(slots) if s.category == FOOD_CATEGORY]

        if len(food_indices) < 2:
            continue

        # Build proximity graph: two food stops are "close" if their travel time <= threshold
        # We use the travel_minutes stored on the slot (travel from previous stop) as a proxy
        # when the full matrix isn't available. If matrix is available, use it for all pairs.
        close_pairs: set[frozenset[int]] = set()

        for a in range(len(food_indices)):
            for b in range(a + 1, len(food_indices)):
                ia = food_indices[a]
                ib = food_indices[b]
                if matrix:
                    travel = matrix[ia][ib] if ia < len(matrix) and ib < len(matrix[ia]) else None
                else:
                    travel = None

                # Fallback: if they're consecutive in the itinerary, use stored travel_minutes
                if travel is None:
                    if abs(ia - ib) == 1:
                        later = max(ia, ib)
                        travel = slots[later].travel_minutes
                    else:
                        travel = None  # can't determine — skip

                if travel is not None and travel <= threshold_minutes:
                    close_pairs.add(frozenset({ia, ib}))

        if not close_pairs:
            continue

        # Group connected food stops into clusters
        clusters = _connected_components(food_indices, close_pairs)
        for cluster in clusters:
            if len(cluster) < 2:
                continue
            names = [slots[i].name for i in sorted(cluster)]
            # Find the max pairwise travel among the cluster for the reason string
            max_travel = 0
            for a_idx in range(len(cluster)):
                for b_idx in range(a_idx + 1, len(cluster)):
                    ia = sorted(cluster)[a_idx]
                    ib = sorted(cluster)[b_idx]
                    if matrix and ia < len(matrix) and ib < len(matrix[ia]):
                        max_travel = max(max_travel, matrix[ia][ib])
            reason = (
                f"{len(names)} food spots within "
                f"{'~' + str(max_travel) + ' min' if max_travel else str(threshold_minutes) + ' min'} "
                f"of each other"
            )
            suggestions.append(
                FoodCrawlSuggestion(places=names, day_index=day.day_index, reason=reason)
            )

    return suggestions


def _connected_components(
    food_indices: list[int],
    close_pairs: set[frozenset[int]],
) -> list[set[int]]:
    """Union-find to group food stops into connected clusters."""
    parent = {i: i for i in food_indices}

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for pair in close_pairs:
        a, b = list(pair)
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    groups: dict[int, set[int]] = {}
    for i in food_indices:
        root = find(i)
        groups.setdefault(root, set()).add(i)

    return list(groups.values())
