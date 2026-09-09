"""Purge all HDF5 artifacts from MinIO and remove run records."""

from sqlalchemy import delete, text

from slicer_api.db import SessionLocal
from slicer_api.models import Run
from slicer_api.storage import delete_all_artifacts, ensure_bucket


def main() -> None:
    ensure_bucket()
    deleted_objects = delete_all_artifacts()
    print(f"Deleted {deleted_objects} MinIO objects")

    with SessionLocal() as db:
        count = db.scalar(text("SELECT COUNT(*) FROM runs")) or 0
        db.execute(delete(Run))
        db.commit()
        print(f"Deleted {count} runs from database")


if __name__ == "__main__":
    main()
