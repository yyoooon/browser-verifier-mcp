import CDP from "chrome-remote-interface";
import { findTargetByPort } from "./target.js";
import { attachBuffers, detachBuffers } from "./buffers.js";

const CDP_PORT = 9223;

interface AttachState {
  client: CDP.Client;
  targetId: string;
  url: string;
  port: number;
}

let state: AttachState | null = null;

export interface AttachInfo {
  port: number;
  targetId: string;
  url: string;
}

export async function attach(port: number): Promise<AttachInfo> {
  if (state && state.port === port) {
    const ok = await isAlive(state.client);
    if (ok) {
      const info = await state.client.Target.getTargetInfo({
        targetId: state.targetId,
      });
      state.url = info.targetInfo.url;
      return { port: state.port, targetId: state.targetId, url: state.url };
    }
    await closeQuiet(state.client);
    state = null;
  }

  if (state) {
    await closeQuiet(state.client);
    state = null;
  }

  const target = await findTargetByPort(port, CDP_PORT);
  if (!target) {
    throw new Error(
      `No Chrome target at http(s)://localhost:${port}. Open the dev server in Chrome 9223 first.`,
    );
  }

  const client = await CDP({ port: CDP_PORT, target: target.id });

  await Promise.all([
    client.Page.enable(),
    client.Runtime.enable(),
    client.Network.enable(),
    client.DOM.enable(),
  ]);

  attachBuffers(client);
  client.on("disconnect", () => {
    if (state && state.client === client) {
      state = null;
      detachBuffers();
    }
  });

  state = { client, targetId: target.id, url: target.url, port };
  return { port, targetId: target.id, url: target.url };
}

export async function ensureAttached(): Promise<AttachState> {
  if (!state) {
    throw new Error(
      "browser_setup not called. Invoke browser_setup({ port }) first.",
    );
  }
  const ok = await isAlive(state.client);
  if (!ok) {
    const port = state.port;
    state = null;
    await attach(port);
  }
  return state!;
}

export function getCurrent(): AttachState | null {
  return state;
}

async function isAlive(client: CDP.Client): Promise<boolean> {
  try {
    await client.Runtime.evaluate({ expression: "1" });
    return true;
  } catch {
    return false;
  }
}

async function closeQuiet(client: CDP.Client) {
  try {
    await client.close();
  } catch {
    // ignore
  }
}
