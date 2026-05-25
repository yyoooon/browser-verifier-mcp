import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  definition as setupDef,
  handler as setupHandler,
} from "./tools/setup.js";
import { definition as evalDef, handler as evalHandler } from "./tools/eval.js";
import {
  definition as batchDef,
  handler as batchHandler,
} from "./tools/batch.js";
import {
  urlDefinition as waitUrlDef,
  textDefinition as waitTextDef,
  selectorDefinition as waitSelectorDef,
  loadDefinition as waitLoadDef,
  waitUrlHandler,
  waitTextHandler,
  waitSelectorHandler,
  waitLoadHandler,
} from "./tools/wait.js";
import {
  clickDefinition,
  navigateDefinition,
  fillInputDefinition,
  navigateUrlDefinition,
  reloadDefinition,
  clickHandler,
  navigateHandler,
  fillInputHandler,
  gotoHandler,
  reloadHandler,
} from "./tools/actions.js";
import {
  consoleDefinition,
  networkDefinition,
  urlDefinition as getUrlDef,
  visibilityDefinition,
  consoleHandler,
  networkHandler,
  urlHandler,
  visibilityHandler,
} from "./tools/checks.js";
import {
  listDefinition as tabListDef,
  listHandler as tabListHandler,
} from "./tools/tabs.js";
import {
  definition as sentinelDef,
  handler as sentinelHandler,
} from "./tools/sentinel.js";
import {
  definition as screenshotDef,
  handler as screenshotHandler,
} from "./tools/screenshot.js";

const server = new Server(
  { name: "browser-verifier", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

const tools = [
  setupDef,
  evalDef,
  batchDef,
  waitUrlDef,
  waitTextDef,
  waitSelectorDef,
  waitLoadDef,
  clickDefinition,
  navigateDefinition,
  fillInputDefinition,
  navigateUrlDefinition,
  reloadDefinition,
  consoleDefinition,
  networkDefinition,
  getUrlDef,
  visibilityDefinition,
  tabListDef,
  sentinelDef,
  screenshotDef,
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(
  CallToolRequestSchema,
  async (request): Promise<any> => {
    const { name, arguments: args = {} } = request.params;

    try {
      switch (name) {
        case "browser_setup":
          return await setupHandler(args as { port?: number });
        case "browser_eval":
          return await evalHandler(
            args as { script: string; timeoutMs?: number },
          );
        case "browser_batch":
          return await batchHandler(args as Parameters<typeof batchHandler>[0]);
        case "browser_wait_url":
          return await waitUrlHandler(
            args as { pattern: string; timeoutMs?: number },
          );
        case "browser_wait_text":
          return await waitTextHandler(
            args as { text: string; timeoutMs?: number },
          );
        case "browser_wait_selector":
          return await waitSelectorHandler(
            args as { selector: string; timeoutMs?: number },
          );
        case "browser_wait_load":
          return await waitLoadHandler(
            args as {
              state?: "load" | "domcontentloaded" | "networkidle" | "hydrated";
              timeoutMs?: number;
            },
          );
        case "browser_click":
          return await clickHandler(args as { text: string });
        case "browser_navigate":
          return await navigateHandler(
            args as {
              clickText: string;
              expectedUrl: string;
              timeoutMs?: number;
            },
          );
        case "browser_fill_input":
          return await fillInputHandler(
            args as { selector: string; value: string },
          );
        case "browser_goto":
          return await gotoHandler(args as { url: string; timeoutMs?: number });
        case "browser_reload":
          return await reloadHandler();
        case "browser_check_console":
          return await consoleHandler(
            args as Parameters<typeof consoleHandler>[0],
          );
        case "browser_check_network":
          return await networkHandler(
            args as Parameters<typeof networkHandler>[0],
          );
        case "browser_get_url":
          return await urlHandler();
        case "browser_is_visible":
          return await visibilityHandler(args as { selector: string });
        case "browser_tab_list":
          return await tabListHandler();
        case "browser_sentinel_save":
          return await sentinelHandler(args as { projectRoot?: string });
        case "browser_screenshot":
          return await screenshotHandler(
            args as Parameters<typeof screenshotHandler>[0],
          );
        default:
          return {
            content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
