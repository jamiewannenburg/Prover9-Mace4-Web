import type {
  ProgramRunRequestV2,
  RunAccepted,
  RunArtifactPayload,
  RunArtifactsPayload,
  RunMutationResult,
  RunSummary,
} from "../types";

/** Strip trailing slashes so paths join predictably. */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function joinUrl(baseUrl: string, path: string): string {
  const base = normalizeBaseUrl(baseUrl);
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

async function readErrorBody(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { detail?: unknown };
    if (j && typeof j === "object" && "detail" in j) {
      return typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    }
  } catch {
    /* ignore */
  }
  return text || res.statusText;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${await readErrorBody(res)}`);
  }
  return res.json() as Promise<T>;
}

export async function listRuns(baseUrl: string): Promise<RunSummary[]> {
  return fetchJson<RunSummary[]>(joinUrl(baseUrl, "/runs"));
}

export async function getRunStatus(
  baseUrl: string,
  runId: string
): Promise<RunSummary> {
  const id = encodeURIComponent(runId);
  return fetchJson<RunSummary>(joinUrl(baseUrl, `/runs/${id}/status`));
}

export async function getRunArtifacts(
  baseUrl: string,
  runId: string
): Promise<RunArtifactsPayload> {
  const id = encodeURIComponent(runId);
  return fetchJson<RunArtifactsPayload>(
    joinUrl(baseUrl, `/runs/${id}/artifacts`)
  );
}

export async function getArtifact(
  baseUrl: string,
  runId: string,
  artifact: string
): Promise<RunArtifactPayload> {
  const id = encodeURIComponent(runId);
  const a = encodeURIComponent(artifact);
  return fetchJson<RunArtifactPayload>(
    joinUrl(baseUrl, `/runs/${id}/artifacts/${a}`)
  );
}

export async function downloadArtifact(
  baseUrl: string,
  runId: string,
  artifact: string
): Promise<Blob> {
  const id = encodeURIComponent(runId);
  const a = encodeURIComponent(artifact);
  const url = joinUrl(baseUrl, `/runs/${id}/download/${a}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${await readErrorBody(res)}`);
  }
  return res.blob();
}

export async function cancelRun(
  baseUrl: string,
  runId: string
): Promise<RunMutationResult> {
  const id = encodeURIComponent(runId);
  return fetchJson<RunMutationResult>(
    joinUrl(baseUrl, `/runs/${id}/cancel`),
    { method: "POST" }
  );
}

export async function deleteRun(
  baseUrl: string,
  runId: string
): Promise<RunMutationResult> {
  const id = encodeURIComponent(runId);
  return fetchJson<RunMutationResult>(joinUrl(baseUrl, `/runs/${id}`), {
    method: "DELETE",
  });
}

async function launch(
  baseUrl: string,
  path: string,
  body: ProgramRunRequestV2
): Promise<RunAccepted> {
  return fetchJson<RunAccepted>(joinUrl(baseUrl, path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function launchProver9(
  baseUrl: string,
  body: ProgramRunRequestV2
): Promise<RunAccepted> {
  return launch(baseUrl, "/prover9", body);
}

export function launchMace4(
  baseUrl: string,
  body: ProgramRunRequestV2
): Promise<RunAccepted> {
  return launch(baseUrl, "/mace4", body);
}

export function launchProoftrans(
  baseUrl: string,
  body: ProgramRunRequestV2
): Promise<RunAccepted> {
  return launch(baseUrl, "/prooftrans", body);
}

export function launchInterpformat(
  baseUrl: string,
  body: ProgramRunRequestV2
): Promise<RunAccepted> {
  return launch(baseUrl, "/interpformat", body);
}

export function launchIsofilter(
  baseUrl: string,
  body: ProgramRunRequestV2
): Promise<RunAccepted> {
  return launch(baseUrl, "/isofilter", body);
}

/**
 * Resolve a relative `stream_url` from `RunAccepted` against the API base
 * (e.g. `/runs/abc/stream` → absolute URL for EventSource).
 */
export function resolveStreamUrl(baseUrl: string, streamUrl: string): string {
  try {
    return new URL(streamUrl, `${normalizeBaseUrl(baseUrl)}/`).href;
  } catch {
    return joinUrl(baseUrl, streamUrl.replace(/^\//, ""));
  }
}
