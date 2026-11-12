export const SEARCH_DEADLINE_MS = 125_000;

/** One end-to-end deadline, including response decoding and polling. */
export async function withinSearchDeadline<T>(parent: AbortSignal, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let rejectCancellation: (reason: Error) => void = () => {};
  const cancel = () => { controller.abort(); rejectCancellation(new DOMException("Canceled", "AbortError")); };
  const canceled = new Promise<never>((_, reject) => { rejectCancellation = reject; });
  parent.addEventListener("abort", cancel, { once: true });
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      canceled,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Object.assign(new Error("The service safety timeout was reached. Try a smaller area or shorter mission window. Your inputs are retained."), { code: "timeout" }));
        }, SEARCH_DEADLINE_MS);
        if (parent.aborted) cancel();
      }),
      work(controller.signal),
    ]);
  } catch (error) {
    if (controller.signal.aborted && !parent.aborted) throw Object.assign(new Error("The service safety timeout was reached. Try a smaller area or shorter mission window. Your inputs are retained."), { code: "timeout" });
    throw error;
  } finally {
    clearTimeout(timer!);
    parent.removeEventListener("abort", cancel);
  }
}
