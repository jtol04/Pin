from __future__ import annotations
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models import Place, ScheduleResult, MultiDayScheduleResult, Trip
from services import db, maps
from services.clustering import cluster_by_geography, balance_day_loads
from scheduler import build_itinerary, build_multiday_itinerary

router = APIRouter(prefix="/trips")


class CreateTripRequest(BaseModel):
    places: list[Place] = []
    day_start: float = 9.0
    day_end: float = 21.0
    transport_mode: str = "driving"
    start_date: str | None = None
    end_date: str | None = None


class UpdateTripRequest(BaseModel):
    places: list[Place]
    day_start: float = 9.0
    day_end: float = 21.0
    transport_mode: str = "driving"
    start_date: str | None = None
    end_date: str | None = None


async def _matrix_for(places: list[Place], mode: str):
    if len(places) < 2:
        return None
    place_ids = [p.place_id or "" for p in places]
    coords = [
        (p.lat, p.lng) if p.lat is not None and p.lng is not None else (0.0, 0.0)
        for p in places
    ]
    return await maps.get_travel_time_matrix(place_ids, mode=mode, coords=coords)


async def _schedule(
    places: list[Place],
    day_start: float,
    day_end: float,
    mode: str,
    start_date: str | None,
    end_date: str | None,
) -> dict:
    """
    Run the scheduler. When start_date/end_date are provided we use the
    multi-day path (geographic clustering + per-day TSPTW); otherwise we
    fall back to a single-day schedule.

    Returns a dict shaped as MultiDayScheduleResult so the frontend can
    always render day tabs (a single-day result is just one-day list).
    """
    if not places:
        empty: ScheduleResult = build_itinerary([], day_start, day_end)
        return {
            "days": [{
                "day_index": 0,
                "date": start_date,
                "itinerary": [s.model_dump() for s in empty.itinerary],
                "conflicts": empty.conflicts,
                "stats": empty.stats,
            }],
            "food_crawl_suggestions": [],
            "total_stats": empty.stats,
        }

    if start_date and end_date:
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
        num_days = max(1, (end - start).days + 1)

        buckets = cluster_by_geography(places, num_days)
        buckets = balance_day_loads(buckets, day_start, day_end)

        travel_matrices: list[list[list[int]]] = []
        for bucket in buckets:
            m = await _matrix_for(bucket, mode)
            travel_matrices.append(m or [])

        dates = [(start + timedelta(days=i)).isoformat() for i in range(num_days)]
        result: MultiDayScheduleResult = build_multiday_itinerary(
            buckets,
            day_start=day_start,
            day_end=day_end,
            travel_matrices=travel_matrices,
            dates=dates,
        )
        return result.model_dump()

    # Single-day fallback
    matrix = await _matrix_for(places, mode)
    single = build_itinerary(places, day_start, day_end, matrix)
    return {
        "days": [{
            "day_index": 0,
            "date": None,
            "itinerary": [s.model_dump() for s in single.itinerary],
            "conflicts": single.conflicts,
            "stats": single.stats,
        }],
        "food_crawl_suggestions": [],
        "total_stats": single.stats,
    }


@router.post("/")
async def create_trip(body: CreateTripRequest):
    """
    Create a new shareable trip. Returns the trip id and the generated
    multi-day itinerary so the client can render immediately.
    """
    result = await _schedule(
        body.places, body.day_start, body.day_end,
        body.transport_mode, body.start_date, body.end_date,
    )
    trip_id = await db.create_trip(
        body.places, body.day_start, body.day_end,
        start_date=body.start_date, end_date=body.end_date,
        transport_mode=body.transport_mode,
    )

    if trip_id:
        await db.update_trip(
            trip_id,
            body.places,
            body.day_start,
            body.day_end,
            itinerary=result,
            start_date=body.start_date,
            end_date=body.end_date,
            transport_mode=body.transport_mode,
        )

    return {
        "id": trip_id,
        "places": body.places,
        "day_start": body.day_start,
        "day_end": body.day_end,
        "transport_mode": body.transport_mode,
        "start_date": body.start_date,
        "end_date": body.end_date,
        "itinerary": result,
    }


@router.get("/{trip_id}")
async def get_trip(trip_id: str):
    row = await db.get_trip(trip_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return row


@router.put("/{trip_id}")
async def update_trip(trip_id: str, body: UpdateTripRequest):
    """
    Replace the trip's places list (and optional dates) and return a fresh
    multi-day itinerary. Called when a collaborator adds, removes, or
    reorders a stop on the shared view.
    """
    result = await _schedule(
        body.places, body.day_start, body.day_end,
        body.transport_mode, body.start_date, body.end_date,
    )
    await db.update_trip(
        trip_id,
        body.places,
        body.day_start,
        body.day_end,
        itinerary=result,
        start_date=body.start_date,
        end_date=body.end_date,
        transport_mode=body.transport_mode,
    )
    return {
        "id": trip_id,
        "places": body.places,
        "day_start": body.day_start,
        "day_end": body.day_end,
        "transport_mode": body.transport_mode,
        "start_date": body.start_date,
        "end_date": body.end_date,
        "itinerary": result,
    }
