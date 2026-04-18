"""
Pin scheduler — TSP with Time Windows (TSPTW) via OR-Tools.

Flow:
  1. Receive ordered places + n×n travel time matrix (minutes).
  2. OR-Tools finds the visit order that minimises total travel while
     respecting time windows (fixed_start = tight window, flexible = full day).
  3. Walk the result to compute exact start/end times and detect conflicts.

Fallback: if OR-Tools finds no solution (infeasible day), returns places in
input order so the caller always gets a usable schedule.
"""

from __future__ import annotations
from datetime import date as _date

from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from models import Place, ItinerarySlot, ScheduleResult, DayItinerary, MultiDayScheduleResult
from services.food_crawl import detect_food_crawls

FLAT_TRAVEL_MINUTES = 20  # used when no matrix is supplied

# ── Meal time windows (minutes from midnight) ──────────────────────────────
MEAL_WINDOWS: dict[str, tuple[int, int]] = {
    "breakfast": (7 * 60,  11 * 60),   # 7am – 11am
    "lunch":     (11 * 60, 15 * 60),   # 11am – 3pm
    "dinner":    (18 * 60, 23 * 60),   # 6pm – 11pm
}


# ── Opening hours helpers ─────────────────────────────────────────────────

def _google_weekday(date_iso: str) -> int:
    """Convert ISO date to Google weekday (0=Sunday … 6=Saturday)."""
    d = _date.fromisoformat(date_iso)
    # Python weekday: 0=Mon…6=Sun → Google: 0=Sun…6=Sat
    python_wd = d.weekday()  # 0=Mon
    return (python_wd + 1) % 7  # 0=Sun


def _oh_to_minutes(time_str: str) -> int:
    """Convert "0900" → 540 (minutes from midnight)."""
    h = int(time_str[:2])
    m = int(time_str[2:])
    return h * 60 + m


def filter_closed_places(
    places: list[Place],
    date_iso: str | None,
) -> tuple[list[Place], list[str]]:
    """
    Remove places that are closed on the given date.
    Returns (open_places, conflict_messages).
    """
    if not date_iso:
        return places, []

    gwd = _google_weekday(date_iso)
    open_places: list[Place] = []
    conflicts: list[str] = []

    for p in places:
        if not p.opening_hours:
            open_places.append(p)
            continue
        day_hours = p.opening_hours[gwd] if gwd < len(p.opening_hours) else None
        if day_hours is None:
            # Closed on this weekday
            day_name = _date.fromisoformat(date_iso).strftime("%A")
            conflicts.append(f"{p.name} is closed on {day_name}s — removed from this day")
        else:
            open_places.append(p)

    return open_places, conflicts


def _opening_hours_window(place: Place, date_iso: str) -> tuple[int, int] | None:
    """Return (open_min, close_min) for a place on the given date, or None."""
    if not place.opening_hours:
        return None
    gwd = _google_weekday(date_iso)
    day_hours = place.opening_hours[gwd] if gwd < len(place.opening_hours) else None
    if not day_hours:
        return None
    return _oh_to_minutes(day_hours["open"]), _oh_to_minutes(day_hours["close"])


def fmt(h: float) -> str:
    """Convert decimal hours (e.g. 13.5) → '1:30pm'."""
    total_minutes = round(h * 60)
    hour = total_minutes // 60
    minute = total_minutes % 60
    period = "am" if hour < 12 else "pm"
    display = hour if hour <= 12 else hour - 12
    if display == 0:
        display = 12
    return f"{display}:{minute:02d}{period}"


def _solve_tsptw(
    places: list[Place],
    travel: list[list[int]],  # minutes, n×n
    day_start_min: int,
    day_end_min: int,
    date_iso: str | None = None,  # used to look up opening hours windows
) -> list[int]:
    """
    Returns the optimal visit order as a list of 0-based indices into `places`.
    Uses a single depot (node 0) with zero travel cost — standard closed TSP
    formulation. If the solver finds no feasible solution, returns input order.
    """
    n = len(places)
    if n <= 1:
        return list(range(n))

    # Nodes: 0 = depot (start of day), 1..n = places
    manager = pywrapcp.RoutingIndexManager(n + 1, 1, 0)
    routing = pywrapcp.RoutingModel(manager)

    def _travel(i: int, j: int) -> int:
        if i == 0 or j == 0:
            return 0  # depot has no physical location — zero travel cost
        return travel[i - 1][j - 1]

    def time_callback(from_idx: int, to_idx: int) -> int:
        from_node = manager.IndexToNode(from_idx)
        to_node = manager.IndexToNode(to_idx)
        t = _travel(from_node, to_node)
        if from_node != 0:
            t += int(places[from_node - 1].duration * 60)  # service time at origin
        return t

    transit_idx = routing.RegisterTransitCallback(time_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_idx)

    # Time dimension — cumulative time from midnight.
    # Max slack is full day range so meal/opening-hours windows can be respected
    # even when there are large gaps between activities (e.g. breakfast → dinner).
    routing.AddDimension(
        transit_idx,
        day_end_min - day_start_min,  # max slack per stop: full day flexibility
        day_end_min,                   # hard upper bound on cumulative time
        False,                         # don't force start cumul to zero
        "Time",
    )
    time_dim = routing.GetDimensionOrDie("Time")

    # Depot: vehicle departs exactly at day_start.
    # Must use routing.Start(0)/routing.End(0) — NodeToIndex(0) returns an invalid
    # index for the depot node and silently produces no constraint.
    time_dim.CumulVar(routing.Start(0)).SetRange(day_start_min, day_start_min)
    time_dim.CumulVar(routing.End(0)).SetRange(day_start_min, day_end_min)

    # Place time windows
    for i, place in enumerate(places):
        node_idx = manager.NodeToIndex(i + 1)
        if place.fixed_start is not None:
            fs = int(place.fixed_start * 60)
            time_dim.CumulVar(node_idx).SetRange(fs, fs)
            continue

        # Default: full day window
        earliest = day_start_min
        latest = day_end_min - int(place.duration * 60)

        # Narrow by opening hours if available
        if date_iso:
            oh = _opening_hours_window(place, date_iso)
            if oh:
                oh_open, oh_close = oh
                earliest = max(earliest, oh_open)
                latest = min(latest, oh_close - int(place.duration * 60))

        # Narrow by meal type if set
        if place.meal_type and place.meal_type in MEAL_WINDOWS:
            meal_open, meal_close = MEAL_WINDOWS[place.meal_type]
            earliest = max(earliest, meal_open)
            latest = min(latest, meal_close - int(place.duration * 60))

        time_dim.CumulVar(node_idx).SetRange(earliest, max(earliest, latest))

    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_params.time_limit.seconds = 5

    solution = routing.SolveWithParameters(search_params)

    if solution is None:
        return list(range(n))

    order: list[int] = []
    index = routing.Start(0)
    while not routing.IsEnd(index):
        node = manager.IndexToNode(index)
        if node != 0:
            order.append(node - 1)
        index = solution.Value(routing.NextVar(index))

    return order


def build_itinerary(
    places: list[Place],
    day_start: float = 9.0,
    day_end: float = 21.0,
    travel_matrix: list[list[int]] | None = None,  # minutes, n×n
    locked_order: bool = False,  # if True, skip TSPTW and use input order
    date_iso: str | None = None,  # ISO date for opening hours + meal windows
) -> ScheduleResult:
    if not places:
        return ScheduleResult(
            itinerary=[],
            conflicts=[],
            stats={"stops": 0, "total_hours": 0, "free_hours": round(day_end - day_start, 2), "fits_in_day": True},
        )

    # Filter out places closed on this date; prepend any closure conflicts
    closed_conflicts: list[str] = []
    if date_iso:
        places, closed_conflicts = filter_closed_places(places, date_iso)
        if not places:
            return ScheduleResult(
                itinerary=[],
                conflicts=closed_conflicts,
                stats={"stops": 0, "total_hours": 0, "free_hours": round(day_end - day_start, 2), "fits_in_day": True},
            )

    n = len(places)
    day_start_min = int(day_start * 60)
    day_end_min = int(day_end * 60)

    # Use flat matrix if none provided or empty
    if not travel_matrix:
        travel_matrix = [
            [0 if i == j else FLAT_TRAVEL_MINUTES for j in range(n)]
            for i in range(n)
        ]

    # Get optimal visit order (or use input order if locked)
    order = list(range(n)) if locked_order else _solve_tsptw(places, travel_matrix, day_start_min, day_end_min, date_iso)

    # Walk the ordered stops and compute exact start/end times
    slots: list[ItinerarySlot] = []
    conflicts: list[str] = list(closed_conflicts)  # start with any closure warnings
    cursor = day_start_min  # minutes from midnight

    for step, idx in enumerate(order):
        place = places[idx]
        duration_min = int(place.duration * 60)

        travel_min = 0
        if step > 0:
            prev_idx = order[step - 1]
            travel_min = travel_matrix[prev_idx][idx]
            cursor += travel_min

        # Snap to fixed_start if set
        if place.fixed_start is not None:
            fs_min = int(place.fixed_start * 60)
            if cursor > fs_min:
                late = cursor - fs_min
                conflicts.append(
                    f"Arrived at {place.name} at {fmt(cursor / 60)} "
                    f"but it's fixed at {fmt(place.fixed_start)} — {late}min late"
                )
            cursor = fs_min
        else:
            # Snap to earliest allowed window (meal type / opening hours).
            # The solver determined the visit ORDER; we now enforce the actual
            # earliest start time so stops aren't placed before their window opens.
            earliest = cursor
            if place.meal_type and place.meal_type in MEAL_WINDOWS:
                meal_open, _ = MEAL_WINDOWS[place.meal_type]
                earliest = max(earliest, meal_open)
            if date_iso:
                oh = _opening_hours_window(place, date_iso)
                if oh:
                    earliest = max(earliest, oh[0])
            cursor = earliest

        start_min = cursor
        end_min = cursor + duration_min

        if end_min > day_end_min:
            conflicts.append(
                f"{place.name} runs until {fmt(end_min / 60)}, "
                f"past the {fmt(day_end)} cutoff"
            )

        slots.append(ItinerarySlot(
            name=place.name,
            start=round(start_min / 60, 4),
            end=round(end_min / 60, 4),
            pinned=place.fixed_start is not None,
            travel_minutes=travel_min,
            place_id=place.place_id,
            lat=place.lat,
            lng=place.lng,
            category=place.category,
        ))

        cursor = end_min

    total_hours = sum(p.duration for p in places)
    total_travel = sum(s.travel_minutes for s in slots) / 60
    free_hours = max(0.0, (day_end - day_start) - total_hours - total_travel)

    stats = {
        "stops": len(slots),
        "total_hours": round(total_hours, 2),
        "total_travel_hours": round(total_travel, 2),
        "free_hours": round(free_hours, 2),
        "fits_in_day": not any("past the" in c for c in conflicts),
    }

    return ScheduleResult(itinerary=slots, conflicts=conflicts, stats=stats)


def remove_and_reschedule(
    places: list[Place],
    name: str,
    day_start: float = 9.0,
    day_end: float = 21.0,
    travel_matrix: list[list[int]] | None = None,
    locked_order: bool = False,
) -> ScheduleResult:
    filtered = [p for p in places if p.name != name]
    # travel_matrix must also be filtered — drop the row/col for the removed place
    if travel_matrix is not None:
        idx = next((i for i, p in enumerate(places) if p.name == name), None)
        if idx is not None:
            travel_matrix = [
                [travel_matrix[r][c] for c in range(len(places)) if c != idx]
                for r in range(len(places)) if r != idx
            ]
    return build_itinerary(filtered, day_start, day_end, travel_matrix, locked_order)


def build_multiday_itinerary(
    day_buckets: list[list[Place]],
    day_start: float = 9.0,
    day_end: float = 21.0,
    travel_matrices: list[list[list[int]]] | None = None,  # per-day n×n matrices
    dates: list[str] | None = None,  # ISO date strings per day
) -> MultiDayScheduleResult:
    """
    Runs build_itinerary for each day bucket, aggregates stats,
    and detects food crawl opportunities across all days.
    """
    day_itineraries: list[DayItinerary] = []
    used_matrices: list[list[list[int]]] = []

    for day_idx, places in enumerate(day_buckets):
        matrix = (travel_matrices[day_idx] if travel_matrices and day_idx < len(travel_matrices) else None)
        day_date = dates[day_idx] if dates and day_idx < len(dates) else None
        result = build_itinerary(places, day_start, day_end, matrix, date_iso=day_date)
        day_itineraries.append(DayItinerary(
            day_index=day_idx,
            date=dates[day_idx] if dates and day_idx < len(dates) else None,
            itinerary=result.itinerary,
            conflicts=result.conflicts,
            stats=result.stats,
        ))
        used_matrices.append(matrix or [])

    # Aggregate total stats
    total_stops = sum(d.stats.get("stops", 0) for d in day_itineraries)
    total_hours = sum(d.stats.get("total_hours", 0.0) for d in day_itineraries)
    total_travel = sum(d.stats.get("total_travel_hours", 0.0) for d in day_itineraries)
    total_free = sum(d.stats.get("free_hours", 0.0) for d in day_itineraries)
    all_fit = all(d.stats.get("fits_in_day", True) for d in day_itineraries)

    total_stats = {
        "stops": total_stops,
        "total_hours": round(total_hours, 2),
        "total_travel_hours": round(total_travel, 2),
        "free_hours": round(total_free, 2),
        "fits_in_day": all_fit,
        "num_days": len(day_buckets),
    }

    food_crawls = detect_food_crawls(day_itineraries, used_matrices)

    return MultiDayScheduleResult(
        days=day_itineraries,
        food_crawl_suggestions=food_crawls,
        total_stats=total_stats,
    )
