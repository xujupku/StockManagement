import os
from dotenv import load_dotenv


BASE_DIR = os.path.dirname(__file__)
DEFAULT_DB_DIR = os.path.join(BASE_DIR, "data")

load_dotenv(os.path.join(BASE_DIR, ".env"))


def get_db_dir() -> str:
    db_dir = os.getenv("DB_DIR", DEFAULT_DB_DIR)
    db_dir = os.path.abspath(db_dir)
    os.makedirs(db_dir, exist_ok=True)
    return db_dir


def get_db_path(filename: str) -> str:
    db_dir = get_db_dir()
    new_path = os.path.join(db_dir, filename)

    legacy_path = os.path.join(BASE_DIR, filename)
    if legacy_path != new_path and os.path.exists(legacy_path) and not os.path.exists(new_path):
        os.replace(legacy_path, new_path)
        for suffix in ("-wal", "-shm"):
            legacy_sidecar = f"{legacy_path}{suffix}"
            new_sidecar = f"{new_path}{suffix}"
            if os.path.exists(legacy_sidecar) and not os.path.exists(new_sidecar):
                os.replace(legacy_sidecar, new_sidecar)

    return new_path
