"""
Central config — loads .env once from the backend directory,
exports all settings as constants. Import from here, not os.getenv directly.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Always resolve relative to this file so it works regardless of cwd
load_dotenv(Path(__file__).parent / ".env", override=True)

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
ANTHROPIC_API_KEY   = os.getenv("ANTHROPIC_API_KEY", "")
SUPABASE_URL        = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY   = os.getenv("SUPABASE_ANON_KEY", "")
