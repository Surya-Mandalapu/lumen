import { afterEach, describe, expect, it, vi } from "vitest";
import { SEARCH_DEADLINE_MS, withinSearchDeadline } from "./deadline";
import { runAnalysis } from "./planning-api";
import { DEFAULT_REQUEST } from "./missions";
import type { CoverageCatalog } from "./planning";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("Safety watchdog, separate from the 30-second average latency target", () => {
  it("allows searches past 30 seconds and aborts truly stalled work at the safety deadline", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const pending = withinSearchDeadline(new AbortController().signal, current => { signal = current; return new Promise(() => {}); });
    const assertion = expect(pending).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(SEARCH_DEADLINE_MS - 30_000);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("counts response decoding in the budget", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, ok: true, json: () => new Promise(() => {}) }));
    const assertion = expect(runAnalysis(DEFAULT_REQUEST, { search_service: { mode: "synchronous" } } as CoverageCatalog, new AbortController().signal, () => {})).rejects.toMatchObject({ code: "timeout", status: 504 });
    await vi.advanceTimersByTimeAsync(SEARCH_DEADLINE_MS);
    await assertion;
  });
  it("returns a successful slower result instead of cutting it off at 30 seconds", async () => {
    vi.useFakeTimers();
    const pending = withinSearchDeadline(new AbortController().signal, () => new Promise<string>(resolve => setTimeout(() => resolve("complete"), 45_000)));
    await vi.advanceTimersByTimeAsync(45_000);
    expect(await pending).toBe("complete");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("uses one budget across repeated job polling", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json({ job_id: "waiting", status: "queued" }, { status: 202 }))));
    const assertion = expect(runAnalysis(DEFAULT_REQUEST, { search_service: { mode: "jobs" } } as CoverageCatalog, new AbortController().signal, () => {})).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(SEARCH_DEADLINE_MS);
    await assertion;
    expect(fetch).toHaveBeenCalledWith("/api/v1/jobs/waiting", { method: "DELETE" });
  });
  it("cancels immediately and clears its timer", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const pending = withinSearchDeadline(abort.signal, () => new Promise(() => {}));
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    abort.abort();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("returns fast results and removes the deadline", async () => {
    vi.useFakeTimers();
    expect(await withinSearchDeadline(new AbortController().signal, async () => "done")).toBe("done");
    expect(vi.getTimerCount()).toBe(0);
  });
});
