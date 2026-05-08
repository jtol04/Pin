from __future__ import annotations
from datetime import date, timedelta

from fastapi import APIRouter
from pydantic import BaseModel

from models import ScheduleRequest, ScheduleResult, MultiDayScheduleRequest, MultiDayScheduleResult
from services import maps
from services.clustering import cluster_by_geography, balance_day_loads, estimate_num_days
from scheduler import build_itinerary, remove_and_reschedule, build_multiday_itinerary

router = APIRouter(prefix="/itinerary")


async def _get_matrix(places, mode: str = "driving"):
    """
    Fetch travel times for the trip. Uses Google Distance Matrix with live
    traffic when place_ids are real; falls back per-pair to coordinate-based
    estimates for synthetic IDs or missing place_ids.
    """
    if len(places) < 2:
        return None
    place_ids = [p.place_id or "" for p in places]
    coords = [
        (p.lat, p.lng) if p.lat is not None and p.lng is not None else (0.0, 0.0)
        for p in places
    ]
    return await maps.get_travel_time_matrix(place_ids, mode=mode, coords=coords)


@router.post("/generate", response_model=ScheduleResult)
async def generate(request: ScheduleRequest) -> ScheduleResult:
    matrix = await _get_matrix(request.places, request.transport_mode)
    return build_itinerary(request.places, request.day_start, request.day_end, matrix, request.locked_order)


class RemoveRequest(ScheduleRequest):
    remove: str


@router.post("/remove", response_model=ScheduleResult)
async def remove(request: RemoveRequest) -> ScheduleResult:
    matrix = await _get_matrix(request.places, request.transport_mode)
    return remove_and_reschedule(
        request.places, request.remove, request.day_start, request.day_end, matrix, request.locked_order
    )


@router.post("/generate-multiday", response_model=MultiDayScheduleResult)
async def generate_multiday(request: MultiDayScheduleRequest) -> MultiDayScheduleResult:
    # 1. Filter to selected places
    selected = (
        [p for p in request.places if p.name in request.selected_names]
        if request.selected_names
        else [p for p in request.places if p.selected]
    )
    if not selected:
        selected = list(request.places)

    # 2. Derive num_days from date range
    start = date.fromisoformat(request.start_date)
    end = date.fromisoformat(request.end_date)
    num_days = max(1, (end - start).days + 1)

    # 3. Cluster places geographically
    buckets = cluster_by_geography(selected, num_days)
    buckets = balance_day_loads(buckets, request.day_start, request.day_end)

    # 4. Build per-day travel matrices (only for days where all places have place_ids)
    travel_matrices: list[list[list[int]]] | None = []
    for bucket in buckets:
        m = await _get_matrix(bucket, request.transport_mode)
        travel_matrices.append(m or [])

    # 5. Generate ISO date strings for each day
    dates = [(start + timedelta(days=i)).isoformat() for i in range(num_days)]

    # 6. Build multi-day itinerary
    return build_multiday_itinerary(
        buckets,
        day_start=request.day_start,
        day_end=request.day_end,
        travel_matrices=travel_matrices,
        dates=dates,
    )
