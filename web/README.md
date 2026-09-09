# Slicer web

React + Vite frontend for launching runs and viewing heatmaps.

## Local development

Requires API on `http://localhost:8000` (and worker + infra for compute).

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173 — Vite proxies `/api/*` to the API.

## Docker

Included in `deploy/docker-compose.yml` as service `web` on port 5173.

## Stage 3–4 scope

- Parameter form loaded from `GET /registry/attraction_map`
- Run submission + status polling
- Multi-layer heatmap overlay (compatible `parameter_plane` frames)
- Drag to select region → **Refine region** (creates child run with `parent_run_id`)
- Layer panel: visibility, opacity, ordering
- Legacy PhaseSlicer palettes per calculation type
- Linked trajectories from parameter / IC map clicks

Not yet: tile pyramid for large grids.
