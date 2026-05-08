from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models import Place, ScheduleResult, Trip
from services import db, maps
from scheduler import build_itinerary

router = APIRouter(prefix="/trips")


class CreateTripRequest(BaseModel):
    places: list[Place] = []
    day_start: float = 9.0
    day_end: float = 21.0
    transport_mode: str = "driving"


class UpdateTripRequest(BaseModel):
    places: list[Place]
    day_start: float = 9.0
    day_end: float = 21.0
    transport_mode: str = "driving"


async def _schedule(
    places: list[Place], day_start: float, day_end: float, mode: str = "driving"
) -> ScheduleResult:
    """
    Fetch travel matrix then run the TSPTW scheduler. Uses Google Distance
    Matrix with live traffic when place_ids are real; falls back per-pair to
    coordinate-based Haversine estimates for synthetic IDs or missing
    place_ids.
    """
    matrix = None
    if len(places) >= 2:
        place_ids = [p.place_id or "" for p in places]
        coords = [
            (p.lat, p.lng) if p.lat is not None and p.lng is not None else (0.0, 0.0)
            for p in places
        ]
        matrix = await maps.get_travel_time_matrix(place_ids, mode=mode, coords=coords)
    return build_itinerary(places, day_start, day_end, matrix)


@router.post("/")
async def create_trip(body: CreateTripRequest):
    """
    Create a new trip. Returns the trip ID (UUID) to share via URL.
    """
    result = await _schedule(body.places, body.day_start, body.day_end, body.transport_mode) if body.places else None
    trip_id = await db.create_trip(body.places, body.day_start, body.day_end)

    if trip_id and result is not None:
        await db.update_trip(
            trip_id,
            body.places,
            body.day_start,
            body.day_end,
            result.model_dump(),
        )

    return {"id": trip_id, "itinerary": result}


@router.get("/{trip_id}")
async def get_trip(trip_id: str):
    row = await db.get_trip(trip_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return row


@router.put("/{trip_id}")
async def update_trip(trip_id: str, body: UpdateTripRequest):
    """
    Replace the places list for a trip and return a fresh itinerary.
    Called whenever a group member adds or removes a stop.
    """
    result = await _schedule(body.places, body.day_start, body.day_end, body.transport_mode)
    await db.update_trip(
        trip_id,
        body.places,
        body.day_start,
        body.day_end,
        result.model_dump(),
    )
    return {"itinerary": result}
