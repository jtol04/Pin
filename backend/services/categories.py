"""
Derives a human-friendly category from the raw Google Places `types` list.
First match in CATEGORY_MAP wins; falls back to "other".
"""

from __future__ import annotations

CATEGORY_MAP: list[tuple[list[str], str]] = [
    (
        [
            "restaurant", "cafe", "bakery", "bar", "food",
            "meal_takeaway", "meal_delivery", "night_club",
        ],
        "food",
    ),
    (
        ["museum", "art_gallery"],
        "museum",
    ),
    (
        ["park", "natural_feature", "campground"],
        "park",
    ),
    (
        [
            "shopping_mall", "store", "clothing_store", "department_store",
            "shoe_store", "jewelry_store", "home_goods_store", "furniture_store",
            "electronics_store", "book_store", "florist", "hardware_store",
            "pet_store", "bicycle_store",
        ],
        "shopping",
    ),
    (
        [
            "tourist_attraction", "point_of_interest", "monument",
            "place_of_worship", "stadium", "amusement_park",
        ],
        "attraction",
    ),
    (
        ["lodging", "hotel"],
        "lodging",
    ),
]


def derive_category(types: list[str]) -> str:
    """Return the first matching category for the given Google Places types."""
    for google_types, category in CATEGORY_MAP:
        if any(t in types for t in google_types):
            return category
    return "other"


# ── Meal type detection ────────────────────────────────────────────────────

FOOD_TYPES = {
    "restaurant", "cafe", "bakery", "bar", "food",
    "meal_takeaway", "meal_delivery", "night_club",
}

MEAL_TYPE_KEYWORDS: dict[str, list[str]] = {
    "breakfast": [
        "breakfast", "brunch", "bagel", "pastry", "croissant",
        "coffee", "espresso", "diner", "morning",
    ],
    "lunch": [
        "lunch", "sandwich", "deli", "bento", "ramen",
        "pho", "noodle", "noodles",
    ],
    "dinner": [
        "dinner", "bar", "grill", "pub", "tavern", "supper",
        "steakhouse", "izakaya", "bistro", "brasserie",
    ],
}


def derive_meal_type(name: str, types: list[str]) -> str | None:
    """
    Returns "breakfast", "lunch", "dinner", or None.
    Only applies to food places. Checks place name keywords first
    (highest signal), then falls back to Google place types.
    """
    if not any(t in types for t in FOOD_TYPES):
        return None  # Not a food place — no meal constraint

    name_lower = name.lower()
    for meal, keywords in MEAL_TYPE_KEYWORDS.items():
        if any(kw in name_lower for kw in keywords):
            return meal

    # Type-based fallback (weaker signal)
    if any(t in types for t in ["bar", "night_club"]):
        return "dinner"
    if any(t in types for t in ["cafe", "bakery"]):
        return "breakfast"

    return None  # Generic food, no meal time constraint
