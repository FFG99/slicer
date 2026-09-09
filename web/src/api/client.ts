import type { GridData, RegistryResponse, Run, RunList, SystemsResponse, TrajectoryData } from "../types";

const base = "/api";

export interface GridQuery {
  dataset?: "values" | "composition" | "periods";
  max_dim?: number;
  row_start?: number;
  row_end?: number;
  col_start?: number;
  col_end?: number;
  downsample?: number;
}

export interface TrajectoryQuery {
  max_points?: number;
  start?: number;
  end?: number;
  downsample?: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json() as Promise<T>;
}

export function listCalculations() {
  return request<RegistryResponse>("/registry");
}

export function getCalculationRegistry(calculationType: string) {
  return request<RegistryResponse>(`/registry/${calculationType}`);
}

export function listSystems() {
  return request<SystemsResponse>("/systems");
}

export function getSystem(systemName: string) {
  return request<SystemsResponse>(`/systems/${systemName}`);
}

export async function uploadSystem(body: {
  source: string;
  description?: string;
  defaultStartingPoint?: string;
}) {
  const form = new FormData();
  form.set("source", body.source);
  if (body.description) {
    form.set("description", body.description);
  }
  if (body.defaultStartingPoint) {
    form.set("default_starting_point", body.defaultStartingPoint);
  }

  const response = await fetch(`${base}/systems`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json() as Promise<SystemsResponse>;
}

export async function deleteSystem(systemName: string) {
  const response = await fetch(`${base}/systems/${encodeURIComponent(systemName)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json() as Promise<{ deleted: string }>;
}

export function createRun(body: {
  calculation_type: string;
  system: string;
  parameters: Record<string, unknown>;
  parent_run_id?: string;
}) {
  return request<Run>("/runs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getRun(runId: string) {
  return request<Run>(`/runs/${runId}`);
}

export async function downloadRunArtifact(runId: string): Promise<Blob> {
  const response = await fetch(`${base}/runs/${encodeURIComponent(runId)}/artifact`, {
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.blob();
}

export function cancelRun(runId: string) {
  return request<Run>(`/runs/${runId}/cancel`, { method: "POST" });
}

export async function deleteRun(runId: string) {
  const response = await fetch(`${base}/runs/${encodeURIComponent(runId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json() as Promise<{ deleted: string }>;
}

export function listRuns(params?: {
  status?: string;
  calculation_type?: string;
  system?: string;
  parent_run_id?: string;
  limit?: number;
  offset?: number;
}) {
  const query = new URLSearchParams();
  query.set("limit", String(params?.limit ?? 50));
  if (params?.offset !== undefined) {
    query.set("offset", String(params.offset));
  }
  if (params?.status) {
    query.set("status", params.status);
  }
  if (params?.calculation_type) {
    query.set("calculation_type", params.calculation_type);
  }
  if (params?.system) {
    query.set("system", params.system);
  }
  if (params?.parent_run_id) {
    query.set("parent_run_id", params.parent_run_id);
  }
  return request<RunList>(`/runs?${query.toString()}`);
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

export async function getRunGrid(runId: string, params?: GridQuery) {
  const grid = await request<GridData & { values: (number | null)[][] }>(
    `/runs/${runId}/grid${buildQuery({
      dataset: params?.dataset,
      max_dim: params?.max_dim,
      row_start: params?.row_start,
      row_end: params?.row_end,
      col_start: params?.col_start,
      col_end: params?.col_end,
      downsample: params?.downsample,
    })}`,
  );
  // Divergent / non-finite cells arrive as null; carry them as NaN internally so
  // the rendering layer can paint them with the divergence color.
  const values = grid.values.map((row) => row.map((v) => (v === null ? NaN : v)));
  return { ...grid, values } as GridData;
}

export function computePhasePortrait(body: {
  system: string;
  parameters: Record<string, unknown>;
}) {
  return request<TrajectoryData>("/phase-portrait/compute", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function downloadPhasePortraitExport(body: {
  system: string;
  parameters: Record<string, unknown>;
}) {
  const response = await fetch(`${base}/phase-portrait/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.blob();
}

export function getRunTrajectory(runId: string, params?: TrajectoryQuery) {
  return request<TrajectoryData>(
    `/runs/${runId}/trajectory${buildQuery({
      max_points: params?.max_points,
      start: params?.start,
      end: params?.end,
      downsample: params?.downsample,
    })}`,
  );
}
