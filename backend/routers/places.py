from fastapi import APIRouter, Query
from pydantic import BaseModel

from models import PlaceSuggestion
from services import maps, ai
from services.categories import derive_category, derive_meal_type

router = APIRouter(prefix="/places")


# ── Opening-hours helpers ──────────────────────────────────────────────────
# Build a 7-element opening_hours list (0=Sunday … 6=Saturday) where each
# entry is {"open": "HHMM", "close": "HHMM"} or None for a closed day.

def _oh(open_t: str, close_t: str, closed_days: tuple[int, ...] = ()) -> list[dict | None]:
    """Same hours every day, except indices in `closed_days` (0=Sun … 6=Sat)."""
    return [
        None if i in closed_days else {"open": open_t, "close": close_t}
        for i in range(7)
    ]


def _oh_24() -> list[dict | None]:
    """Always open — outdoor parks, public squares, 24-hour spots."""
    return [{"open": "0000", "close": "2359"} for _ in range(7)]


def _oh_custom(per_day: list[tuple[str, str] | None]) -> list[dict | None]:
    """Custom per-day hours. Pass a 7-element list of (open, close) tuples
    or None for closed days. Index 0=Sun, 6=Sat."""
    return [
        None if entry is None else {"open": entry[0], "close": entry[1]}
        for entry in per_day
    ]


class ImportRequest(BaseModel):
    url: str


class ImportResult(BaseModel):
    places: list[PlaceSuggestion]
    source: str


class RecommendationsRequest(BaseModel):
    regions: list[str] = []
    categories: list[str] = []
    existing_place_ids: list[str] = []


class Recommendation(BaseModel):
    place: PlaceSuggestion
    sponsored: bool = False
    sponsor_label: str | None = None  # e.g. "Featured by Visit NYC"
    tagline: str = ""                  # one-line "why we picked this"


class RecommendationsResult(BaseModel):
    recommendations: list[Recommendation]


DEMO_IMPORTS: dict[str, tuple[str, list[str]]] = {
    "instagram.com/p/nyc-foodie": (
        "instagram",
        ["Joe's Pizza NYC", "Los Tacos No. 1 NYC", "Levain Bakery NYC"],
    ),
    "instagram.com/p/dh7sa2tuvww": (
        "instagram",
        ["Tsujita Shibuya Fukuras", "Afuri Ebisu", "Ippudo Shibuya"],
    ),
    "tiktok.com/@traveler/tokyo": (
        "tiktok",
        ["Senso-ji Temple Tokyo", "Shibuya Crossing Tokyo", "Tsukiji Outer Market Tokyo", "Meiji Shrine Tokyo"],
    ),
    "reddit.com/r/travel/paris": (
        "reddit",
        ["Musée d'Orsay Paris", "Le Marais Paris", "Sainte-Chapelle Paris"],
    ),
}


# Hardcoded place data for demo URLs so social import works without a live
# Google Maps key. Keyed by the place name passed to the demo extractor.
DEMO_PLACE_DATA: dict[str, dict] = {
    "Joe's Pizza NYC": {
        "place_id": "demo-joes-pizza",
        "name": "Joe's Pizza",
        "address": "7 Carmine St, New York, NY 10014",
        "lat": 40.7305, "lng": -74.0027,
        "suggested_duration": 0.5,
        "duration_note": "Most visitors grab a slice in 20–30 min",
        "types": ["restaurant", "food"],
        "category": "food",
        "region": "West Village",
        "meal_type": "lunch",
        "opening_hours": _oh("1000", "0400"),  # daily 10am–4am
    },
    "Los Tacos No. 1 NYC": {
        "place_id": "demo-los-tacos",
        "name": "Los Tacos No. 1",
        "address": "75 9th Ave, New York, NY 10011",
        "lat": 40.7421, "lng": -74.0061,
        "suggested_duration": 0.75,
        "duration_note": "Quick counter-service tacos, ~45 min",
        "types": ["restaurant", "food"],
        "category": "food",
        "region": "Chelsea",
        "meal_type": "lunch",
        "opening_hours": _oh("1100", "2300"),  # daily 11am–11pm
    },
    "Levain Bakery NYC": {
        "place_id": "demo-levain",
        "name": "Levain Bakery",
        "address": "167 W 74th St, New York, NY 10023",
        "lat": 40.7794, "lng": -73.9810,
        "suggested_duration": 0.5,
        "duration_note": "Walk-up bakery, plan ~30 min including wait",
        "types": ["bakery", "food"],
        "category": "food",
        "region": "Upper West Side",
        "meal_type": "breakfast",
        "opening_hours": _oh("0800", "1900"),  # daily 8am–7pm
    },
    "Senso-ji Temple Tokyo": {
        "place_id": "demo-sensoji",
        "name": "Senso-ji Temple",
        "address": "2 Chome-3-1 Asakusa, Taito City, Tokyo",
        "lat": 35.7148, "lng": 139.7967,
        "suggested_duration": 1.5,
        "duration_note": "Temple grounds + Nakamise street, 1.5–2h",
        "types": ["place_of_worship", "tourist_attraction"],
        "category": "attraction",
        "region": "Tokyo",
        "opening_hours": _oh("0600", "1700"),  # main hall 6am–5pm; grounds open
    },
    "Shibuya Crossing Tokyo": {
        "place_id": "demo-shibuya",
        "name": "Shibuya Crossing",
        "address": "Shibuya City, Tokyo",
        "lat": 35.6595, "lng": 139.7004,
        "suggested_duration": 0.5,
        "duration_note": "Iconic crossing — plan ~30 min",
        "types": ["tourist_attraction", "point_of_interest"],
        "category": "attraction",
        "region": "Tokyo",
        "opening_hours": _oh_24(),  # public street, always accessible
    },
    "Tsukiji Outer Market Tokyo": {
        "place_id": "demo-tsukiji",
        "name": "Tsukiji Outer Market",
        "address": "4 Chome Tsukiji, Chuo City, Tokyo",
        "lat": 35.6654, "lng": 139.7707,
        "suggested_duration": 1.5,
        "duration_note": "Food stalls + market browsing, ~1.5h",
        "types": ["food", "point_of_interest"],
        "category": "food",
        "region": "Tokyo",
        "meal_type": "breakfast",
        "opening_hours": _oh("0500", "1400", closed_days=(0,)),  # 5am–2pm; closed Sundays
    },
    "Meiji Shrine Tokyo": {
        "place_id": "demo-meiji",
        "name": "Meiji Shrine",
        "address": "1-1 Yoyogikamizonocho, Shibuya City, Tokyo",
        "lat": 35.6764, "lng": 139.6993,
        "suggested_duration": 1.5,
        "duration_note": "Forested shrine grounds, 1.5h is typical",
        "types": ["place_of_worship", "park"],
        "category": "attraction",
        "region": "Tokyo",
        "opening_hours": _oh("0600", "1700"),  # sunrise–sunset, ~6am–5pm
    },
    "Musée d'Orsay Paris": {
        "place_id": "demo-orsay",
        "name": "Musée d'Orsay",
        "address": "1 Rue de la Légion d'Honneur, 75007 Paris",
        "lat": 48.8600, "lng": 2.3266,
        "suggested_duration": 2.5,
        "duration_note": "Most visitors spend 2–3h with the collection",
        "types": ["museum", "tourist_attraction"],
        "category": "museum",
        "region": "Paris",
        # 9:30am–6pm Tue–Sun; closed Monday; Thursday late until 9:45pm
        "opening_hours": _oh_custom([
            ("0930", "1800"),  # Sun
            None,              # Mon — closed
            ("0930", "1800"),  # Tue
            ("0930", "1800"),  # Wed
            ("0930", "2145"),  # Thu (late night)
            ("0930", "1800"),  # Fri
            ("0930", "1800"),  # Sat
        ]),
    },
    "Le Marais Paris": {
        "place_id": "demo-marais",
        "name": "Le Marais",
        "address": "Le Marais, 75004 Paris",
        "lat": 48.8589, "lng": 2.3622,
        "suggested_duration": 2.0,
        "duration_note": "Neighborhood walk + cafés, ~2h",
        "types": ["neighborhood", "point_of_interest"],
        "category": "attraction",
        "region": "Paris",
        "opening_hours": _oh_24(),  # neighborhood
    },
    "Sainte-Chapelle Paris": {
        "place_id": "demo-sainte-chapelle",
        "name": "Sainte-Chapelle",
        "address": "10 Bd du Palais, 75001 Paris",
        "lat": 48.8554, "lng": 2.3450,
        "suggested_duration": 1.0,
        "duration_note": "Stained glass chapel, plan ~1h",
        "types": ["church", "tourist_attraction"],
        "category": "attraction",
        "region": "Paris",
        "opening_hours": _oh("0900", "1900"),  # daily 9am–7pm (summer)
    },
    "Tsujita Shibuya Fukuras": {
        "place_id": "demo-tsujita-shibuya",
        "name": "Tsujita Shibuya Fukuras",
        "address": "1-2-3 Dogenzaka, Shibuya City, Tokyo 150-0043",
        "lat": 35.6588, "lng": 139.7008,
        "suggested_duration": 1.0,
        "duration_note": "Tsukemen (dipping noodles) — plan ~1h including queue",
        "types": ["restaurant", "food"],
        "category": "food",
        "region": "Shibuya",
        "meal_type": "lunch",
        "opening_hours": _oh("1100", "2200"),  # daily 11am–10pm
    },
    "Afuri Ebisu": {
        "place_id": "demo-afuri-ebisu",
        "name": "Afuri Ebisu",
        "address": "1-1-7 Ebisu, Shibuya City, Tokyo 150-0013",
        "lat": 35.6464, "lng": 139.7102,
        "suggested_duration": 0.75,
        "duration_note": "Yuzu shio ramen, ~45 min counter service",
        "types": ["restaurant", "food"],
        "category": "food",
        "region": "Ebisu",
        "meal_type": "lunch",
        "opening_hours": _oh("1100", "2300"),  # daily 11am–11pm (late shop varies)
    },
    "Ippudo Shibuya": {
        "place_id": "demo-ippudo-shibuya",
        "name": "Ippudo Shibuya",
        "address": "1-3-12 Shibuya, Shibuya City, Tokyo 150-0002",
        "lat": 35.6585, "lng": 139.7038,
        "suggested_duration": 1.0,
        "duration_note": "Tonkotsu ramen — plan ~1h with seating",
        "types": ["restaurant", "food"],
        "category": "food",
        "region": "Shibuya",
        "meal_type": "dinner",
        "opening_hours": _oh("1100", "2300"),  # daily 11am–11pm
    },
}


def _match_demo(url: str) -> tuple[str, list[str]] | None:
    low = url.lower()
    for key, val in DEMO_IMPORTS.items():
        if key in low:
            return val
    return None


def _demo_suggestion(name: str) -> PlaceSuggestion | None:
    data = DEMO_PLACE_DATA.get(name)
    if not data:
        return None
    return PlaceSuggestion(**data)


# Hardcoded data for the NYC demo trip's place_ids. Lets the demo button
# populate a full itinerary (including map markers) when no Maps key is set.
NYC_DEMO_BY_PLACE_ID: dict[str, dict] = {
    "ChIJ4zGFAZpYwokRGUGph3Mf37k": {
        "name": "Central Park",
        "address": "New York, NY",
        "lat": 40.7829, "lng": -73.9654,
        "suggested_duration": 2.0,
        "duration_note": "Most visitors spend 1.5–3h walking the park",
        "types": ["park", "tourist_attraction"],
        "category": "park",
        "region": "Upper West Side",
        "opening_hours": _oh("0600", "0100"),  # 6am–1am daily
    },
    "ChIJb8Jg9pZYwokR-qHGtvSkLzs": {
        "name": "The Metropolitan Museum of Art",
        "address": "1000 5th Ave, New York, NY 10028",
        "lat": 40.7794, "lng": -73.9632,
        "suggested_duration": 3.0,
        "duration_note": "Plan 2.5–4h to see the major collections",
        "types": ["museum", "tourist_attraction"],
        "category": "museum",
        "region": "Upper East Side",
        # 10am–5pm; closed Wednesdays; Fri/Sat until 9pm
        "opening_hours": _oh_custom([
            ("1000", "1700"),  # Sun
            ("1000", "1700"),  # Mon
            ("1000", "1700"),  # Tue
            None,              # Wed — closed
            ("1000", "1700"),  # Thu
            ("1000", "2100"),  # Fri (late)
            ("1000", "2100"),  # Sat (late)
        ]),
    },
    "ChIJmQJIxlVYwokRLgeuocVOGVU": {
        "name": "Times Square",
        "address": "Manhattan, NY 10036",
        "lat": 40.7580, "lng": -73.9855,
        "suggested_duration": 1.0,
        "duration_note": "Walk through and take photos, ~1h",
        "types": ["tourist_attraction", "point_of_interest"],
        "category": "attraction",
        "region": "Midtown West",
        "opening_hours": _oh_24(),  # public square
    },
    "ChIJK3vOQyNawokRXEa9errdJiU": {
        "name": "Brooklyn Bridge",
        "address": "Brooklyn Bridge, New York, NY",
        "lat": 40.7061, "lng": -73.9969,
        "suggested_duration": 1.0,
        "duration_note": "Walk across the bridge, ~45–60 min",
        "types": ["tourist_attraction", "point_of_interest"],
        "category": "attraction",
        "region": "Brooklyn Heights",
        "opening_hours": _oh_24(),  # pedestrian path is always open
    },
    "ChIJTWE_0BtawokRVJNGH5RS448": {
        "name": "One World Observatory",
        "address": "117 West St, New York, NY 10007",
        "lat": 40.7127, "lng": -74.0134,
        "suggested_duration": 1.5,
        "duration_note": "Observation deck visit, ~1.5h",
        "types": ["tourist_attraction", "point_of_interest"],
        "category": "attraction",
        "region": "Financial District",
        "opening_hours": _oh("0900", "2100"),  # daily 9am–9pm
    },
    "ChIJw2lMFL9ZwokRosAtly52YX4": {
        "name": "Chelsea Market",
        "address": "75 9th Ave, New York, NY 10011",
        "lat": 40.7421, "lng": -74.0061,
        "suggested_duration": 1.5,
        "duration_note": "Food + shops, plan ~1.5h",
        "types": ["food", "shopping_mall"],
        "category": "food",
        "region": "Chelsea",
        "meal_type": "lunch",
        "opening_hours": _oh("0700", "2200"),  # daily 7am–10pm
    },
    "ChIJPTacEpBQwokRKwIlDXelxkA": {
        "name": "Statue of Liberty",
        "address": "New York, NY 10004",
        "lat": 40.6892, "lng": -74.0445,
        "suggested_duration": 3.0,
        "duration_note": "Includes the ferry — most visitors spend 2.5–4h",
        "types": ["tourist_attraction", "point_of_interest"],
        "category": "attraction",
        "region": "Financial District",
        "opening_hours": _oh("0900", "1530"),  # daily 9am–3:30pm last ferry
    },
    "ChIJ5bQPhMdZwokRkTwKhVxhP1g": {
        "name": "The High Line",
        "address": "New York, NY 10011",
        "lat": 40.7480, "lng": -74.0048,
        "suggested_duration": 1.5,
        "duration_note": "Elevated park walk, plan ~1.5h",
        "types": ["park", "tourist_attraction"],
        "category": "park",
        "region": "Chelsea",
        "opening_hours": _oh("0700", "2200"),  # daily 7am–10pm (summer)
    },
}


def _nyc_demo_by_place_id(place_id: str) -> PlaceSuggestion | None:
    data = NYC_DEMO_BY_PLACE_ID.get(place_id)
    if not data:
        return None
    return PlaceSuggestion(place_id=place_id, **data)


@router.post("/import-social", response_model=ImportResult)
async def import_social(body: ImportRequest) -> ImportResult:
    """
    Extract place names from a social media URL (Instagram, TikTok, Reddit, etc.)
    using Claude, then resolve each via Google Places.
    """
    demo = _match_demo(body.url)
    if demo:
        source, place_names = demo
        # Demo URLs short-circuit Maps so the import flow is screenshottable
        # without external API keys.
        canned = [s for s in (_demo_suggestion(n) for n in place_names) if s]
        if canned:
            return ImportResult(places=canned, source=source)
    else:
        from config import ANTHROPIC_API_KEY
        if not ANTHROPIC_API_KEY:
            return ImportResult(places=[], source="unknown")

        from anthropic import AsyncAnthropic
        import json as _json

        client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        msg = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            messages=[{"role": "user", "content": (
                f"Extract location/place names from this social media post URL: {body.url}\n\n"
                "Based on the URL and any location info you can infer, return a JSON object:\n"
                '{"source": "instagram|tiktok|reddit|other", "places": ["Place Name, City", ...]}\n\n'
                "If the URL mentions a specific restaurant, bar, park, museum, etc., include it. "
                "If it mentions a city or neighborhood, include the most notable places there. "
                "Return 1-5 places. Just the JSON, nothing else."
            )}],
        )
        raw = msg.content[0].text.strip()
        if "```" in raw:
            raw = raw.split("```")[1].removeprefix("json").strip()
        data = _json.loads(raw)
        source = data.get("source", "other")
        place_names = data.get("places", [])

    results: list[PlaceSuggestion] = []
    for name in place_names[:5]:
        search = await maps.search_place(name)
        if not search:
            continue
        details = await maps.get_place_details(search["place_id"])
        if not details:
            continue
        types = details.get("types", [])
        hours, note = await ai.suggest_duration(
            details["name"], address=details["address"], place_types=types,
        )
        results.append(PlaceSuggestion(
            name=details["name"],
            place_id=details["place_id"],
            address=details["address"],
            lat=details["lat"],
            lng=details["lng"],
            suggested_duration=hours,
            duration_note=note,
            types=types,
            category=derive_category(types),
            region=details.get("region", ""),
            opening_hours=details.get("opening_hours"),
            meal_type=derive_meal_type(details["name"], types),
        ))

    return ImportResult(places=results, source=source)


@router.get("/autocomplete")
async def autocomplete(q: str = Query(min_length=2)):
    """
    Returns up to 5 autocomplete predictions for the given query string.
    Used to power the place search input on the frontend.
    """
    predictions = await maps.autocomplete(q)
    return {"predictions": predictions}


class SuggestRequest(BaseModel):
    place_id: str
    name: str  # display name from autocomplete, used as fallback


@router.post("/suggest", response_model=PlaceSuggestion)
async def suggest(body: SuggestRequest) -> PlaceSuggestion:
    """
    Given a place_id, fetch its details from Google Maps then ask Claude
    how long a typical visitor would spend there.
    """
    details = await maps.get_place_details(body.place_id)

    if details is None:
        # Maps unavailable — try the canned NYC demo dataset first so the
        # "Load NYC Demo Trip" button still produces full place data.
        demo = _nyc_demo_by_place_id(body.place_id)
        if demo:
            return demo

        hours, note = await ai.suggest_duration(body.name)
        return PlaceSuggestion(
            name=body.name,
            place_id=body.place_id,
            address="",
            lat=0.0,
            lng=0.0,
            suggested_duration=hours,
            duration_note=note,
        )

    types = details.get("types", [])
    hours, note = await ai.suggest_duration(
        details["name"],
        address=details["address"],
        place_types=types,
    )

    return PlaceSuggestion(
        name=details["name"],
        place_id=details["place_id"],
        address=details["address"],
        lat=details["lat"],
        lng=details["lng"],
        suggested_duration=hours,
        duration_note=note,
        types=types,
        category=derive_category(types),
        region=details.get("region", ""),
        opening_hours=details.get("opening_hours"),
        meal_type=derive_meal_type(details["name"], types),
    )


# ── Tailored recommendations ─────────────────────────────────────────────
#
# Sponsored + organic recommendations keyed by region. Each entry includes
# the full place data so the user can add it to their trip with one click.
# The `sponsored` flag drives the "Sponsored" badge in the UI — this is the
# monetization surface for local businesses.

RECOMMENDATIONS_BY_REGION: dict[str, list[dict]] = {
    "New York": [
        {
            "place": {
                "place_id": "rec-katzs",
                "name": "Katz's Delicatessen",
                "address": "205 E Houston St, New York, NY 10002",
                "lat": 40.7223, "lng": -73.9874,
                "suggested_duration": 1.0,
                "duration_note": "Iconic deli — order at the counter, ~1h",
                "types": ["restaurant", "food"],
                "category": "food",
                "region": "Lower East Side",
                "meal_type": "lunch",
                "opening_hours": _oh("0800", "2245"),  # daily 8am–10:45pm
            },
            "sponsored": True,
            "sponsor_label": "Featured by Katz's",
            "tagline": "Pairs with your Lower East Side stops",
        },
        {
            "place": {
                "place_id": "rec-whitney",
                "name": "Whitney Museum of American Art",
                "address": "99 Gansevoort St, New York, NY 10014",
                "lat": 40.7396, "lng": -74.0089,
                "suggested_duration": 2.5,
                "duration_note": "Plan 2–3h for the full collection",
                "types": ["museum", "tourist_attraction"],
                "category": "museum",
                "region": "Meatpacking District",
                # 10:30am–6pm; closed Tuesdays
                "opening_hours": _oh("1030", "1800", closed_days=(2,)),
            },
            "sponsored": False,
            "tagline": "Steps from the High Line — fits your route",
        },
        {
            "place": {
                "place_id": "rec-rooftop",
                "name": "230 Fifth Rooftop",
                "address": "230 5th Ave, New York, NY 10001",
                "lat": 40.7440, "lng": -73.9876,
                "suggested_duration": 1.5,
                "duration_note": "Rooftop bar with skyline views, ~1.5h",
                "types": ["bar", "food"],
                "category": "food",
                "region": "NoMad",
                "meal_type": "dinner",
                "opening_hours": _oh("1600", "0200"),  # 4pm–2am daily
            },
            "sponsored": True,
            "sponsor_label": "Featured by 230 Fifth",
            "tagline": "Empire State views — popular after museum visits",
        },
    ],
    "Tokyo": [
        {
            "place": {
                "place_id": "rec-tsukemen-daikoku",
                "name": "Tsukemen Daikoku",
                "address": "1-7-3 Dogenzaka, Shibuya City, Tokyo 150-0043",
                "lat": 35.6580, "lng": 139.6985,
                "suggested_duration": 1.0,
                "duration_note": "30-seat tsukemen counter — plan ~1h including queue",
                "types": ["restaurant", "food"],
                "category": "food",
                "region": "Shibuya",
                "meal_type": "lunch",
                "opening_hours": _oh("1100", "2200"),  # 11am–10pm daily
            },
            "sponsored": True,
            "sponsor_label": "Featured by Tsukemen Daikoku",
            "tagline": "Independent 30-seat shop · steps from your Shibuya stops",
        },
        {
            "place": {
                "place_id": "rec-teamlab",
                "name": "teamLab Planets",
                "address": "6-1-16 Toyosu, Koto City, Tokyo",
                "lat": 35.6473, "lng": 139.7905,
                "suggested_duration": 2.0,
                "duration_note": "Immersive digital art, ~2h with timed entry",
                "types": ["museum", "tourist_attraction"],
                "category": "museum",
                "region": "Tokyo",
                "opening_hours": _oh("1000", "2100"),  # daily 10am–9pm
            },
            "sponsored": True,
            "sponsor_label": "Featured by teamLab",
            "tagline": "Trending — book a ticket window in advance",
        },
        {
            "place": {
                "place_id": "rec-shibuyasky",
                "name": "Shibuya Sky",
                "address": "2-24-12 Shibuya, Shibuya City, Tokyo",
                "lat": 35.6586, "lng": 139.7016,
                "suggested_duration": 1.5,
                "duration_note": "Open-air observation deck, ~1.5h",
                "types": ["tourist_attraction", "point_of_interest"],
                "category": "attraction",
                "region": "Tokyo",
                "opening_hours": _oh("1000", "2230"),  # daily 10am–10:30pm
            },
            "sponsored": False,
            "tagline": "Same neighborhood as Shibuya Crossing",
        },
        {
            "place": {
                "place_id": "rec-ichiran",
                "name": "Ichiran Shibuya",
                "address": "1-22-7 Jinnan, Shibuya City, Tokyo",
                "lat": 35.6614, "lng": 139.6989,
                "suggested_duration": 0.75,
                "duration_note": "Solo-booth ramen, plan ~45 min including wait",
                "types": ["restaurant", "food"],
                "category": "food",
                "region": "Tokyo",
                "meal_type": "lunch",
                "opening_hours": _oh_24(),  # 24 hours
            },
            "sponsored": True,
            "sponsor_label": "Featured by Ichiran",
            "tagline": "Quick lunch near your Shibuya stops",
        },
    ],
    "Paris": [
        {
            "place": {
                "place_id": "rec-louvre",
                "name": "Louvre Museum",
                "address": "Rue de Rivoli, 75001 Paris",
                "lat": 48.8606, "lng": 2.3376,
                "suggested_duration": 3.0,
                "duration_note": "Plan 2.5–4h for the highlights route",
                "types": ["museum", "tourist_attraction"],
                "category": "museum",
                "region": "Paris",
                # 9am–6pm; closed Tuesdays; Wed/Fri until 9:45pm
                "opening_hours": _oh_custom([
                    ("0900", "1800"),  # Sun
                    ("0900", "1800"),  # Mon
                    None,              # Tue — closed
                    ("0900", "2145"),  # Wed (late)
                    ("0900", "1800"),  # Thu
                    ("0900", "2145"),  # Fri (late)
                    ("0900", "1800"),  # Sat
                ]),
            },
            "sponsored": False,
            "tagline": "Pairs naturally with your Musée d'Orsay visit",
        },
        {
            "place": {
                "place_id": "rec-lavenue",
                "name": "L'Avenue Restaurant",
                "address": "41 Av. Montaigne, 75008 Paris",
                "lat": 48.8669, "lng": 2.3050,
                "suggested_duration": 2.0,
                "duration_note": "Sit-down French dining, ~2h",
                "types": ["restaurant", "food"],
                "category": "food",
                "region": "Paris",
                "meal_type": "dinner",
                "opening_hours": _oh("0800", "0200"),  # daily 8am–2am
            },
            "sponsored": True,
            "sponsor_label": "Featured by L'Avenue",
            "tagline": "Reservation-friendly dinner near the Champs-Élysées",
        },
        {
            "place": {
                "place_id": "rec-eiffel",
                "name": "Eiffel Tower",
                "address": "Champ de Mars, 5 Av. Anatole France, 75007 Paris",
                "lat": 48.8584, "lng": 2.2945,
                "suggested_duration": 2.0,
                "duration_note": "Including queues, ~2h",
                "types": ["tourist_attraction", "point_of_interest"],
                "category": "attraction",
                "region": "Paris",
                "opening_hours": _oh("0900", "0045"),  # daily 9am–12:45am
            },
            "sponsored": False,
            "tagline": "Iconic — most visitors won't want to skip it",
        },
    ],
}


def _region_key(regions: list[str]) -> str:
    """Map a list of place regions to one of our recommendation buckets."""
    joined = " ".join(regions).lower()
    if any(k in joined for k in ("tokyo", "shibuya", "asakusa", "shinjuku")):
        return "Tokyo"
    if "paris" in joined:
        return "Paris"
    # Default to NYC for any NYC neighborhoods or empty regions
    return "New York"


@router.post("/recommendations", response_model=RecommendationsResult)
async def recommendations(body: RecommendationsRequest) -> RecommendationsResult:
    """
    Returns tailored recommendations (mix of sponsored + organic) for the
    trip based on its regions and categories.
    """
    bucket = _region_key(body.regions)
    raw = RECOMMENDATIONS_BY_REGION.get(bucket, [])

    existing = set(body.existing_place_ids)
    recs: list[Recommendation] = []
    for entry in raw:
        place_data = entry["place"]
        if place_data["place_id"] in existing:
            continue
        recs.append(Recommendation(
            place=PlaceSuggestion(**place_data),
            sponsored=entry.get("sponsored", False),
            sponsor_label=entry.get("sponsor_label"),
            tagline=entry.get("tagline", ""),
        ))

    return RecommendationsResult(recommendations=recs[:3])
