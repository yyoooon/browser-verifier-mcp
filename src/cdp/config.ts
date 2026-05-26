// CDP endpoint to attach to. Override via BROWSER_VERIFIER_CDP_URL for
// Docker/WSL setups or non-default Chrome remote-debugging ports.
export const CDP_BASE_URL =
  process.env.BROWSER_VERIFIER_CDP_URL ?? "http://127.0.0.1:9223";
