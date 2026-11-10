import type { SearchRequest, SearchResponse } from "./types";
import type { CoverageCatalog, CoverageOutcome } from "./planning";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
export class PlanningError extends Error {
  constructor(message: string, public code: string, public status: number) { super(message); }
}
async function read<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body.detail;
    const code = detail?.code ?? (response.status === 429 ? "queue_full" : response.status === 410 || response.status === 404 ? "expired" : response.status === 503 ? "waking" : "failed");
    const message = typeof detail === "string" ? detail : detail?.message ??
      ({ queue_full: "The analysis queue is full. Your mission is saved here; retry shortly.", expired: "This temporary analysis expired after a service restart. Submit your mission again.", waking: "The analysis service may be waking up. Keep this page open and retry shortly." }[code as string] ?? "Analysis failed. Your inputs have been retained.");
    throw new PlanningError(message, code, response.status);
  }
  return body as T;
}
export async function getCoverage(signal?: AbortSignal) {
  return read<CoverageCatalog>(await fetch(`${BASE}/coverage`, { signal }));
}
export async function previewCoverage(region: SearchRequest["region"], signal: AbortSignal) {
  return read<CoverageOutcome>(await fetch(`${BASE}/coverage/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(region), signal }));
}
export interface AnalysisState { phase: "submitting" | "queued" | "running"; message: string; queue_position?: number }
interface Job { job_id: string; status: "queued" | "running" | "complete" | "failed" | "canceled" | "expired"; queue_position?: number; message?: string; result?: SearchResponse }
function wait(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException("Canceled", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 800);
    if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
  });
}
export async function runAnalysis(request: SearchRequest, catalog: CoverageCatalog, signal: AbortSignal, onState: (state: AnalysisState) => void): Promise<SearchResponse> {
  const jobs = catalog.search_service?.mode === "jobs";
  onState({ phase: "submitting", message: jobs ? "Submitting your mission…" : "Analyzing your mission. This service does not report incremental progress." });
  const response = await fetch(`${BASE}/${jobs ? "jobs" : "candidates/search"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal });
  if (response.status !== 202 && !jobs) return read<SearchResponse>(response);
  let job = await read<Job>(response);
  if (typeof job.job_id !== "string" || !job.job_id) throw new PlanningError("The service returned an invalid analysis reference. Please retry.", "failed", 502);
  const path = `${BASE}/jobs/${encodeURIComponent(job.job_id)}`;
  const cancel = () => { void fetch(path, { method: "DELETE" }).catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) { cancel(); throw new DOMException("Canceled", "AbortError"); }
    for (;;) {
      if (job.status === "complete") return job.result ?? read<SearchResponse>(await fetch(`${path}/result`, { signal }));
      if (["failed", "canceled", "expired"].includes(job.status)) throw new PlanningError(job.message ?? (job.status === "expired" ? "This temporary analysis expired. Submit your retained mission again." : `Analysis ${job.status}. Your inputs are retained.`), job.status, 409);
      if (job.status !== "queued" && job.status !== "running") throw new PlanningError("Unknown analysis state. Please retry.", "failed", 502);
      onState({ phase: job.status, queue_position: job.queue_position, message: job.message ?? (job.status === "queued" ? "Your mission is queued." : "Calculating the mission’s geometry.") });
      await wait(signal);
      job = await read<Job>(await fetch(path, { signal }));
    }
  } finally { signal.removeEventListener("abort", cancel); }
}
