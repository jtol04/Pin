import json
from config import ANTHROPIC_API_KEY

_client = None


def _get_client():
    global _client
    if _client is None:
        from anthropic import AsyncAnthropic
        _client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    return _client


FALLBACK_DURATION = 1.5
FALLBACK_NOTE = "Suggested 1.5 hrs — add your Anthropic key for smarter estimates"


async def suggest_duration(
    place_name: str,
    address: str = "",
    place_types: list[str] | None = None,
) -> tuple[float, str]:
    """
    Ask Claude how long a typical visitor spends at this place.
    Returns (hours: float, note: str).
    Falls back to 1.5 hrs if no API key is set.
    """
    if not ANTHROPIC_API_KEY:
        return FALLBACK_DURATION, FALLBACK_NOTE

    types_str = ", ".join(place_types or []) or "unknown"
    prompt = (
        f"You are a travel planning assistant. "
        f"A user is visiting: {place_name} ({address}). Place category: {types_str}.\n\n"
        f"Reply with ONLY a JSON object in this exact format, nothing else:\n"
        f'{{ "hours": <number>, "note": "<one short sentence, e.g. Most visitors spend 2–3 hours>" }}\n\n'
        f"Be specific to this place. Use 0.5 increments. Range: 0.5 to 6 hours."
    )

    try:
        client = _get_client()
        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=80,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()
        # Strip markdown code fences if the model wraps the JSON
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        data = json.loads(raw)
        return float(data["hours"]), str(data["note"])
    except Exception as e:
        print(f"[ai.suggest_duration] failed: {e}")
        return FALLBACK_DURATION, FALLBACK_NOTE
