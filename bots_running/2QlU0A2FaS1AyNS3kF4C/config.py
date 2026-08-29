import os
from pathlib import Path

ROOT_DIR = Path(__file__).parent
ENV_PATH = ROOT_DIR / ".env"


def load_dotenv(path: Path = ENV_PATH) -> None:
    if not path.exists():
        return

    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.strip().startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_dotenv()

BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
CLICK_TOKEN = os.environ.get("CLICK_TOKEN", "")
ADMIN_IDS = [
    int(i.strip())
    for i in os.environ.get("ADMIN_IDS", "6920473195").split(",")
    if i.strip().isdigit()
]
ADMIN_PANEL_PASSWORD = os.environ.get("ADMIN_PANEL_PASSWORD", "Ardosher2013#")
CARD_NUMBER = os.environ.get("CARD_NUMBER", "9860170104415857")
HUMO_BOT_USERNAME = os.environ.get("HUMO_BOT_USERNAME", "@HUMOcardbot")
HUMO_PHONE = os.environ.get("HUMO_PHONE", "+8801631530071")
GIRL_ACCOUNT_PHONE = os.environ.get("GIRL_ACCOUNT_PHONE", "")
HUMO_PASSWORD = os.environ.get("HUMO_PASSWORD", "")
GIRL_ACCOUNT_PASSWORD = os.environ.get("GIRL_ACCOUNT_PASSWORD", "")
API_ID = int(os.environ.get("API_ID", "0") or 0)
API_HASH = os.environ.get("API_HASH", "")
DB_PATH = os.environ.get("DB_PATH", "bot_store.db")

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is required in environment or .env file")
