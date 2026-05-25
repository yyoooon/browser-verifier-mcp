import { ensureAttached } from "../runtime/client.js";

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
    const value = await withTimeout(
      state.page.evaluate<unknown, string>((s) => {
        // eslint-disable-next-line no-eval
        return eval(s);
      }, script),
      timeoutMs,
    );
    return {
      ok: true,
      value,
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

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`eval timeout after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
