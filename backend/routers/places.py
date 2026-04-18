from fastapi import APIRouter, Query
from pydantic import BaseModel

from models import PlaceSuggestion
from services import maps, ai
from services.categories import derive_category, derive_meal_type

router = APIRouter(prefix="/places")


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
        # Maps unavailable — return a stub so the frontend still works
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
