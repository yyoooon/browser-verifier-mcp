import { ensureAttached } from "./client.js";

export interface EvalSuccess {
  ok: true;
  value: unknown;
  elapsedMs: number;
}

export interface EvalFailure {
  ok: false;
  error: string;
  elapsedMs: number;
}

export type EvalResult = EvalSuccess | EvalFailure;

const DEFAULT_TIMEOUT_MS = 8000;

export async function evalInBrowser(
  script: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<EvalResult> {
  const state = await ensureAttached();
  const t0 = Date.now();

  try {
    const result = await state.client.Runtime.evaluate({
      expression: script,
      returnByValue: true,
      awaitPromise: true,
      timeout: timeoutMs,
      userGesture: true,
    });

    if (result.exceptionDetails) {
      const ex = result.exceptionDetails;
      const detail =
        ex.exception?.description ?? ex.exception?.value ?? ex.text;
      return {
        ok: false,
        error: typeof detail === "string" ? detail : JSON.stringify(detail),
        elapsedMs: Date.now() - t0,
      };
    }

    return {
      ok: true,
      value: result.result.value,
      elapsedMs: Date.now() - t0,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      elapsedMs: Date.now() - t0,
    };
  }
}
