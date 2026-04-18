from config import SUPABASE_URL, SUPABASE_ANON_KEY

_client = None


def _get_client():
    global _client
    if _client is None:
        from supabase import create_client
        _client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    return _client


def _available() -> bool:
    return bool(SUPABASE_URL and SUPABASE_ANON_KEY)


async def create_trip(places: list, day_start: float, day_end: float) -> str | None:
    if not _available():
        return None

    db = _get_client()
    result = (
        db.table("trips")
        .insert({
            "places": [p.model_dump() for p in places],
            "day_start": day_start,
            "day_end": day_end,
        })
        .execute()
    )
    return result.data[0]["id"]


async def get_trip(trip_id: str) -> dict | None:
    if not _available():
        return None

    db = _get_client()
    result = db.table("trips").select("*").eq("id", trip_id).single().execute()
    return result.data


async def update_trip(
    trip_id: str,
    places: list,
    day_start: float,
    day_end: float,
    itinerary: dict | None = None,
) -> bool:
    if not _available():
        return False

    db = _get_client()
    payload = {
        "places": [p.model_dump() if hasattr(p, "model_dump") else p for p in places],
        "day_start": day_start,
        "day_end": day_end,
    }
    if itinerary is not None:
        payload["itinerary"] = itinerary

    db.table("trips").update(payload).eq("id", trip_id).execute()
    return True
