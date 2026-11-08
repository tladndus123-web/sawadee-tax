// A small MCP server (Model Context Protocol, the way AI agents such as Grok Bot call outside tools) over plain HTTP:
// one JSON-RPC 2.0 message (or a batch) per POST, the answer as JSON — the "Streamable HTTP" transport without streams.
// Only what an agent needs: initialize, ping, tools/list, tools/call. Pure, so it is tested without a server.

export interface McpTool {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  /** Writes something (the agent's own calendar dates) — agents may ask the person first */
  writes?: boolean;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

export const MCP_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export interface ServerInfo {
  name: string;
  version: string;
  instructions: string;
  title?: string;
  websiteUrl?: string;
  icons?: { src: string; mimeType: string; sizes: string[] }[];
}

type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type Reply = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

/** A tool's input checked against its schema's types and required fields (the tools check values themselves) */
export function badArgs(tool: McpTool, args: Record<string, unknown>): string | null {
  for (const k of tool.inputSchema.required ?? []) if (args[k] === undefined || args[k] === null || args[k] === "") return `missing ${k}`;
  for (const [k, v] of Object.entries(args)) {
    const p = tool.inputSchema.properties[k] as { type?: string } | undefined;
    if (!p) return `unknown argument ${k}`;
    if (p.type === "string" && typeof v !== "string") return `${k} must be text`;
    if ((p.type === "integer" || p.type === "number") && typeof v !== "number") return `${k} must be a number`;
  }
  return null;
}

/** Answer one message; notifications (no id) get no answer */
export async function handleOne(m: Msg, tools: McpTool[], info: ServerInfo): Promise<Reply | null> {
  const id = m.id ?? null;
  const ok = (result: unknown): Reply => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string): Reply => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") return err(-32600, "Invalid request");
  if (m.id === undefined) return null;
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion ?? "");
      return ok({
        protocolVersion: MCP_VERSIONS.includes(asked) ? asked : MCP_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: info.name, version: info.version, ...(info.title ? { title: info.title } : {}), ...(info.websiteUrl ? { websiteUrl: info.websiteUrl } : {}), ...(info.icons ? { icons: info.icons } : {}) },
        instructions: info.instructions,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({
        tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: !t.writes, destructiveHint: false } })),
      });
    case "tools/call": {
      const tool = tools.find((t) => t.name === m.params?.name);
      if (!tool) return err(-32602, `Unknown tool ${String(m.params?.name)}`);
      const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
      const bad = typeof args === "object" && !Array.isArray(args) ? badArgs(tool, args) : "arguments must be an object";
      if (bad) return ok({ content: [{ type: "text", text: bad }], isError: true });
      try {
        const out = await tool.run(args);
        return ok({ content: [{ type: "text", text: typeof out === "string" ? out : JSON.stringify(out, null, 1) }] });
      } catch (e) {
        return ok({ content: [{ type: "text", text: e instanceof Error ? e.message : "failed" }], isError: true });
      }
    }
    default:
      return err(-32601, `Method not found: ${m.method}`);
  }
}

/** A POST body: one message or a batch → the JSON to send back (null = 202, nothing to say) */
export async function handleBody(body: unknown, tools: McpTool[], info: ServerInfo): Promise<unknown | null> {
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.slice(0, 20).map((m) => handleOne(m as Msg, tools, info)))).filter(Boolean);
    return out.length ? out : null;
  }
  if (!body || typeof body !== "object") return { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } };
  return handleOne(body as Msg, tools, info);
}
