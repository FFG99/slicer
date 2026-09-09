# Slicer worker

Polls `runs` with `status=queued`, executes the C++ CLI, uploads HDF5 to MinIO, updates Postgres.

## Local run

Requires Postgres, MinIO, and a built `slicer` binary.

```bash
cd deploy && docker compose up -d postgres minio

cd worker
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e .
cp .env.example .env
# edit SLICER_BIN / SLICER_SYSTEMS_DIR if needed
slicer-worker
```

## Docker

```bash
cd deploy
docker compose up -d
```

Worker starts with the API and processes queued runs automatically.
