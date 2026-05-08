import uuid
from config import SUPABASE_URL, SUPABASE_ANON_KEY

_client = None

# In-memory fallback used when Supabase isn't configured, so share links still
# work for demos and local development.
_memory_trips: dict[str, dict] = {}


def _get_client():
    global _client
    if _client is None:
        from supabase import create_client
        _client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    return _client


def _available() -> bool:
    return bool(SUPABASE_URL and SUPABASE_ANON_KEY)


def _serialize_places(places: list) -> list[dict]:
    return [p.model_dump() if hasattr(p, "model_dump") else p for p in places]


def _store_in_memory(
    trip_id: str,
    serialized: list[dict],
    day_start: float,
    day_end: float,
    itinerary: dict | None,
    start_date: str | None = None,
    end_date: str | None = None,
    transport_mode: str | None = None,
) -> None:
    existing = _memory_trips.get(trip_id, {"id": trip_id})
    existing.update({
        "id": trip_id,
        "places": serialized,
        "day_start": day_start,
        "day_end": day_end,
    })
    if itinerary is not None:
        existing["itinerary"] = itinerary
    if start_date is not None:
        existing["start_date"] = start_date
    if end_date is not None:
        existing["end_date"] = end_date
    if transport_mode is not None:
        existing["transport_mode"] = transport_mode
    _memory_trips[trip_id] = existing


async def create_trip(
    places: list,
    day_start: float,
    day_end: float,
    start_date: str | None = None,
    end_date: str | None = None,
    transport_mode: str | None = None,
) -> str | None:
    serialized = _serialize_places(places)

    if _available():
        try:
            db = _get_client()
            payload: dict = {
                "places": serialized,
                "day_start": day_start,
                "day_end": day_end,
            }
            # Include date / mode columns if the Supabase schema supports them.
            # If the schema doesn't, retry without them.
            if start_date:
                payload["start_date"] = start_date
            if end_date:
                payload["end_date"] = end_date
            if transport_mode:
                payload["transport_mode"] = transport_mode
            try:
                result = db.table("trips").insert(payload).execute()
            except Exception as schema_err:
                print(f"[db.create_trip] Supabase rejected extended columns ({schema_err}); inserting base columns only")
                base = {k: payload[k] for k in ("places", "day_start", "day_end")}
                result = db.table("trips").insert(base).execute()
            return result.data[0]["id"]
        except Exception as e:
            # Supabase configured but unreachable — fall through to in-memory
            print(f"[db.create_trip] Supabase failed, using in-memory store: {e}")

    trip_id = uuid.uuid4().hex[:8]
    _store_in_memory(
        trip_id, serialized, day_start, day_end, None,
        start_date=start_date, end_date=end_date, transport_mode=transport_mode,
    )
    return trip_id


async def get_trip(trip_id: str) -> dict | None:
    if _available():
        try:
            db = _get_client()
            result = db.table("trips").select("*").eq("id", trip_id).single().execute()
            return result.data
        except Exception as e:
            print(f"[db.get_trip] Supabase failed, checking in-memory store: {e}")

    return _memory_trips.get(trip_id)


async def update_trip(
    trip_id: str,
    places: list,
    day_start: float,
    day_end: float,
    itinerary: dict | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    transport_mode: str | None = None,
) -> bool:
    serialized = _serialize_places(places)

    if _available():
        try:
            db = _get_client()
            payload = {
                "places": serialized,
                "day_start": day_start,
                "day_end": day_end,
            }
            if itinerary is not None:
                payload["itinerary"] = itinerary
            if start_date is not None:
                payload["start_date"] = start_date
            if end_date is not None:
                payload["end_date"] = end_date
            if transport_mode is not None:
                payload["transport_mode"] = transport_mode
            try:
                db.table("trips").update(payload).eq("id", trip_id).execute()
            except Exception as schema_err:
                print(f"[db.update_trip] Supabase rejected extended columns ({schema_err}); updating base columns only")
                base = {k: payload[k] for k in ("places", "day_start", "day_end") if k in payload}
                if itinerary is not None:
                    base["itinerary"] = itinerary
                db.table("trips").update(base).eq("id", trip_id).execute()
            return True
        except Exception as e:
            print(f"[db.update_trip] Supabase failed, using in-memory store: {e}")

    _store_in_memory(
        trip_id, serialized, day_start, day_end, itinerary,
        start_date=start_date, end_date=end_date, transport_mode=transport_mode,
    )
    return True
