import dns from "node:dns";

// macOS Node 17+에서 'localhost'를 ::1(IPv6)로 먼저 resolve해서
// IPv4 only로 LISTEN 중인 Chrome CDP(기본 127.0.0.1:9223) 등 로컬 서비스에 못 붙는 함정 회피.
dns.setDefaultResultOrder("ipv4first");

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
import {
  definition as semanticDef,
  handler as semanticHandler,
} from "./tools/semantic.js";
import {
  definition as verifyDef,
  handler as verifyHandler,
} from "./tools/verify.js";
import {
  definition as inspectDef,
  handler as inspectHandler,
} from "./tools/inspect.js";
import {
  loadDefinition as tasksLoadDef,
  listDefinition as tasksListDef,
  runDefinition as tasksRunDef,
  loadHandler as tasksLoadHandler,
  listHandler as tasksListHandler,
  runHandler as tasksRunHandler,
} from "./tools/tasks.js";
import { loadTasksFromFile } from "./runtime/tasks/loader.js";
import { setTasks } from "./runtime/tasks/registry.js";
import { BROWSER_RULES } from "./instructions.js";

const server = new Server(
  { name: "browser-verifier", version: "0.2.0" },
  { capabilities: { tools: {} }, instructions: BROWSER_RULES },
);

const tools = [
  setupDef,
  tabListDef,
  sentinelDef,
  consoleDefinition,
  networkDefinition,
  getUrlDef,
  visibilityDefinition,
  semanticDef,
  inspectDef,
  verifyDef,
  tasksLoadDef,
  tasksListDef,
  tasksRunDef,
  evalDef,
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
        case "browser_tab_list":
          return await tabListHandler();
        case "browser_sentinel_save":
          return await sentinelHandler(args as { projectRoot?: string });
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
        case "browser_semantic_state":
          return await semanticHandler();
        case "browser_inspect":
          return await inspectHandler(
            args as Parameters<typeof inspectHandler>[0],
          );
        case "browser_verify":
          return await verifyHandler(
            args as Parameters<typeof verifyHandler>[0],
          );
        case "browser_load_tasks":
          return await tasksLoadHandler(args as { path: string });
        case "browser_list_tasks":
          return await tasksListHandler();
        case "browser_run_task":
          return await tasksRunHandler(
            args as Parameters<typeof tasksRunHandler>[0],
          );
        case "browser_eval":
          return await evalHandler(
            args as { script: string; timeoutMs?: number },
          );
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

const tasksPath = process.env.VERIFIER_TASKS_PATH;
if (tasksPath) {
  try {
    const r = loadTasksFromFile(tasksPath);
    setTasks(r.tasks, r.path);
    const names = Object.keys(r.tasks);
    console.error(
      `[browser-verifier] loaded ${names.length} task(s) from ${r.path}` +
        (r.warnings.length ? ` (warnings: ${r.warnings.join("; ")})` : ""),
    );
  } catch (e) {
    console.error(
      `[browser-verifier] failed to load tasks from ${tasksPath}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}

const transport = new StdioServerTransport();
await server.connect(transport);
