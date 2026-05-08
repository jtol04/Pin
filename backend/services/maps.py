from math import radians, sin, cos, asin, sqrt

import httpx
from config import GOOGLE_MAPS_API_KEY

PLACES_BASE = "https://maps.googleapis.com/maps/api/place"
DISTANCE_BASE = "https://maps.googleapis.com/maps/api/distancematrix/json"

FLAT_TRAVEL_MINUTES = 20

# ── Coordinate-based travel time fallback ─────────────────────────────────
# Used when (a) the Maps API key is missing, (b) the API call fails, or
# (c) a place_id isn't recognized by Google (e.g. synthetic demo IDs).
# Speeds are conservative city-traffic averages; overhead covers parking,
# walking from the lot, transfers, etc.
MODE_SPEED_KMH: dict[str, float] = {
    "driving": 25,
    "walking": 5,
    "bicycling": 15,
    "transit": 20,
}
MODE_OVERHEAD_MIN: dict[str, int] = {
    "driving": 3,
    "walking": 1,
    "bicycling": 2,
    "transit": 5,
}


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    lat1r, lng1r, lat2r, lng2r = (radians(x) for x in (lat1, lng1, lat2, lng2))
    dlat = lat2r - lat1r
    dlng = lng2r - lng1r
    a = sin(dlat / 2) ** 2 + cos(lat1r) * cos(lat2r) * sin(dlng / 2) ** 2
    return 2 * R * asin(sqrt(a))


def _coord_travel_minutes(
    lat1: float, lng1: float, lat2: float, lng2: float, mode: str
) -> int:
    if (lat1, lng1) == (lat2, lng2):
        return 0
    km = _haversine_km(lat1, lng1, lat2, lng2)
    speed = MODE_SPEED_KMH.get(mode, MODE_SPEED_KMH["driving"])
    overhead = MODE_OVERHEAD_MIN.get(mode, MODE_OVERHEAD_MIN["driving"])
    return max(1, round((km / speed) * 60 + overhead))


def _looks_synthetic(place_id: str) -> bool:
    """Demo/recommendation IDs we generate in code (not real Google IDs)."""
    return place_id.startswith(("demo-", "rec-"))


async def search_place(query: str) -> dict | None:
    if not GOOGLE_MAPS_API_KEY:
        return None

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{PLACES_BASE}/textsearch/json",
            params={"query": query, "key": GOOGLE_MAPS_API_KEY},
            timeout=5,
        )

    results = resp.json().get("results", [])
    if not results:
        return None

    top = results[0]
    return {
        "place_id": top["place_id"],
        "name": top["name"],
        "address": top.get("formatted_address", ""),
        "lat": top["geometry"]["location"]["lat"],
        "lng": top["geometry"]["location"]["lng"],
    }


async def autocomplete(input_text: str) -> list[dict]:
    if not GOOGLE_MAPS_API_KEY:
        return []

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{PLACES_BASE}/autocomplete/json",
            params={"input": input_text, "key": GOOGLE_MAPS_API_KEY},
            timeout=5,
        )

    return [
        {"place_id": p["place_id"], "description": p["description"]}
        for p in resp.json().get("predictions", [])[:5]
    ]


def extract_region(address: str) -> str:
    """
    Extract a city-level region from a Google formatted address.
    e.g. "Senso-ji, 2 Chome, Asakusa, Taito City, Tokyo, Japan" → "Tokyo"
    Returns the second-to-last comma-separated token (typically state/prefecture/city).
    Falls back to empty string if the address has fewer than 2 parts.
    """
    parts = [p.strip() for p in address.split(",") if p.strip()]
    if len(parts) >= 2:
        return parts[-2]
    if len(parts) == 1:
        return parts[0]
    return ""


# NYC ZIP code → neighborhood name.
# Google rarely includes a `neighborhood` address component for Manhattan;
# ZIP codes are the reliable signal for neighborhood-level grouping.
_NYC_ZIP_NEIGHBORHOODS: dict[str, str] = {
    # Manhattan
    "10001": "Chelsea",          "10002": "Lower East Side",
    "10003": "East Village",     "10004": "Financial District",
    "10005": "Financial District","10006": "Financial District",
    "10007": "Tribeca",          "10009": "East Village",
    "10010": "Gramercy",         "10011": "Chelsea",
    "10012": "SoHo",             "10013": "Tribeca",
    "10014": "West Village",     "10016": "Murray Hill",
    "10017": "Midtown East",     "10018": "Hell's Kitchen",
    "10019": "Midtown West",     "10020": "Midtown",
    "10021": "Upper East Side",  "10022": "Midtown East",
    "10023": "Upper West Side",  "10024": "Upper West Side",
    "10025": "Upper West Side",  "10026": "Harlem",
    "10027": "Morningside Heights","10028": "Upper East Side",
    "10029": "East Harlem",      "10030": "Harlem",
    "10031": "Washington Heights","10032": "Washington Heights",
    "10033": "Washington Heights","10034": "Inwood",
    "10035": "East Harlem",      "10036": "Hell's Kitchen",
    "10037": "Harlem",           "10038": "Financial District",
    "10040": "Inwood",           "10044": "Roosevelt Island",
    "10065": "Upper East Side",  "10075": "Upper East Side",
    "10128": "Upper East Side",  "10280": "Battery Park City",
    # Brooklyn
    "11201": "Brooklyn Heights", "11205": "Fort Greene",
    "11206": "Williamsburg",     "11211": "Williamsburg",
    "11215": "Park Slope",       "11216": "Bed-Stuy",
    "11217": "Park Slope",       "11221": "Bushwick",
    "11222": "Greenpoint",       "11225": "Crown Heights",
    "11226": "Flatbush",         "11231": "Red Hook",
    "11237": "Bushwick",         "11238": "Prospect Heights",
    "11249": "Williamsburg",
    # Queens
    "11101": "Long Island City", "11102": "Astoria",
    "11103": "Astoria",          "11105": "Astoria",
    "11106": "Astoria",          "11354": "Flushing",
    "11355": "Flushing",         "11375": "Forest Hills",
    "11377": "Woodside",         "11385": "Ridgewood",
}


def extract_region_from_components(
    components: list[dict],
    formatted_address: str,
) -> str:
    """
    Extract the best display region from Google Places address_components.

    For NYC places (locality = "New York"):
      1. Use Google's `neighborhood` component if present (e.g. "Williamsburg")
      2. Fall back to ZIP code → neighborhood lookup (covers most of Manhattan
         where Google omits the neighborhood component entirely)
      3. Fall back to borough (sublocality_level_1)

    For all other cities: falls back to the city-level extract_region logic.
    """
    def get(type_name: str) -> str | None:
        for c in components:
            if type_name in c.get("types", []):
                return c["long_name"]
        return None

    locality = get("locality") or ""

    # Detect NYC: covers Manhattan (locality="New York"), Brooklyn, Queens,
    # Bronx, Staten Island (no locality; sublocality_level_1 = borough name).
    _NYC_BOROUGHS = {"manhattan", "brooklyn", "queens", "bronx", "staten island"}
    _NYC_COUNTIES = {"new york county", "kings county", "queens county", "bronx county", "richmond county"}
    borough = get("sublocality_level_1") or ""
    county = get("administrative_area_level_2") or ""
    is_nyc = (
        locality.lower() == "new york"
        or borough.lower() in _NYC_BOROUGHS
        or county.lower() in _NYC_COUNTIES
    )

    if is_nyc:
        # 1. Google neighborhood component (most accurate when present)
        for t in ("neighborhood", "sublocality_level_3", "sublocality_level_2"):
            name = get(t)
            if name:
                return name

        # 2. ZIP → neighborhood lookup
        postal = get("postal_code")
        if postal and postal in _NYC_ZIP_NEIGHBORHOODS:
            return _NYC_ZIP_NEIGHBORHOODS[postal]

        # 3. Borough fallback (e.g. "Brooklyn", "Queens")
        if borough:
            return borough

        return locality or "New York"

    # Non-NYC: city-level grouping from formatted address
    return extract_region(formatted_address)


def parse_opening_hours(oh: dict) -> list[dict | None] | None:
    """
    Convert Google Places opening_hours.periods into a 7-element list
    indexed by weekday (0=Sunday … 6=Saturday), each entry:
      {"open": "0900", "close": "2200"}  or None if closed that day.
    Handles overnight periods where close.day != open.day.
    Returns None if opening_hours data is unavailable.
    """
    periods = oh.get("periods")
    if not periods:
        return None

    # Seed with None (closed) for all 7 days
    result: list[dict | None] = [None] * 7

    for period in periods:
        open_info = period.get("open", {})
        close_info = period.get("close")
        day = open_info.get("day")  # 0=Sunday…6=Saturday
        if day is None:
            continue
        open_time = open_info.get("time", "0000")
        # If no close info, treat as open 24h
        close_time = close_info.get("time", "2359") if close_info else "2359"
        result[day] = {"open": open_time, "close": close_time}

    return result


async def get_place_details(place_id: str) -> dict | None:
    if not GOOGLE_MAPS_API_KEY:
        return None

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{PLACES_BASE}/details/json",
            params={
                "place_id": place_id,
                "fields": "name,geometry,formatted_address,address_components,types,opening_hours",
                "key": GOOGLE_MAPS_API_KEY,
            },
            timeout=5,
        )

    result = resp.json().get("result")
    if not result:
        return None

    address = result.get("formatted_address", "")
    components = result.get("address_components", [])
    oh_raw = result.get("opening_hours", {})
    opening_hours = parse_opening_hours(oh_raw) if oh_raw else None

    return {
        "place_id": place_id,
        "name": result["name"],
        "address": address,
        "lat": result["geometry"]["location"]["lat"],
        "lng": result["geometry"]["location"]["lng"],
        "types": result.get("types", []),
        "region": extract_region_from_components(components, address),
        "opening_hours": opening_hours,
    }


def _coord_matrix(
    coords: list[tuple[float, float]] | None,
    n: int,
    mode: str,
) -> list[list[int]]:
    """Full n×n travel matrix from lat/lng pairs. Falls back to flat 20 min
    only if coordinates are missing — in which case we genuinely have no
    information."""
    if not coords or len(coords) != n:
        return [[0 if i == j else FLAT_TRAVEL_MINUTES for j in range(n)] for i in range(n)]
    return [
        [
            0 if i == j else _coord_travel_minutes(
                coords[i][0], coords[i][1], coords[j][0], coords[j][1], mode
            )
            for j in range(n)
        ]
        for i in range(n)
    ]


async def get_travel_time_matrix(
    place_ids: list[str],
    mode: str = "driving",
    coords: list[tuple[float, float]] | None = None,
) -> list[list[int]]:
    """
    Returns an n×n matrix of travel times in minutes.

    Order of preference per pair:
      1. Google Distance Matrix with `departure_time=now` for live-traffic
         driving times.
      2. Haversine-distance estimate using mode-specific speed (covers any
         pair Google couldn't resolve, e.g. synthetic demo place_ids).
      3. Flat FLAT_TRAVEL_MINUTES (only if we have neither place_ids that
         Google recognizes nor coordinates).
    """
    n = len(place_ids)
    if n < 2:
        return [[0]] if n == 1 else []

    # No API key, or every place_id is synthetic — skip the API call entirely.
    all_synthetic = all(_looks_synthetic(p) for p in place_ids)
    if not GOOGLE_MAPS_API_KEY or all_synthetic:
        return _coord_matrix(coords, n, mode)

    # Google won't recognize synthetic IDs; only send real ones. Build a
    # secondary "real-id-only" call and back-fill the rest from coordinates.
    real_indices = [i for i, p in enumerate(place_ids) if not _looks_synthetic(p)]
    real_ids = [place_ids[i] for i in real_indices]

    # Pre-fill matrix with coordinate-based estimates as the baseline
    matrix = _coord_matrix(coords, n, mode)

    if len(real_ids) < 2:
        return matrix  # nothing useful to ask Google

    origins = "|".join(f"place_id:{pid}" for pid in real_ids)
    params: dict[str, str | int] = {
        "origins": origins,
        "destinations": origins,
        "mode": mode,
        "key": GOOGLE_MAPS_API_KEY,
    }
    # Live traffic is only meaningful for driving and requires departure_time.
    if mode == "driving":
        params["departure_time"] = "now"
        params["traffic_model"] = "best_guess"

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(DISTANCE_BASE, params=params, timeout=10)
        data = resp.json()

        if data.get("status") != "OK":
            return matrix

        for row_idx, row in enumerate(data["rows"]):
            for col_idx, element in enumerate(row["elements"]):
                if element.get("status") != "OK":
                    continue
                # Prefer traffic-aware duration when present (driving + departure_time)
                duration = element.get("duration_in_traffic") or element.get("duration") or {}
                seconds = duration.get("value")
                if seconds is None:
                    continue
                # Map the API row/col back to the original matrix indices
                i = real_indices[row_idx]
                j = real_indices[col_idx]
                matrix[i][j] = seconds // 60

        return matrix

    except Exception as e:
        print(f"[maps.get_travel_time_matrix] failed: {e}")
        return matrix
