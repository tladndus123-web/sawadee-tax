import { describe, expect, it } from "vitest";
import { handleBody, type McpTool } from "./mcp";

const info = { name: "t", version: "1", instructions: "hi" };
const tools: McpTool[] = [
  { name: "echo", description: "d", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, run: async (a) => ({ said: a.text }) },
  { name: "boom", description: "d", writes: true, inputSchema: { type: "object", properties: {} }, run: async () => { throw new Error("nope"); } },
];

describe("MCP over HTTP", () => {
  it("initialize answers with a version the client knows", async () => {
    const r = (await handleBody({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, tools, info)) as { result: { protocolVersion: string; capabilities: object; instructions: string } };
    expect(r.result.protocolVersion).toBe("2025-03-26");
    expect(r.result.capabilities).toHaveProperty("tools");
    expect(r.result.instructions).toBe("hi");
    const u = (await handleBody({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, tools, info)) as { result: { protocolVersion: string } };
    expect(u.result.protocolVersion).toBe("2025-06-18");
  });
  it("notifications get no answer", async () => {
    expect(await handleBody({ jsonrpc: "2.0", method: "notifications/initialized" }, tools, info)).toBeNull();
  });
  it("lists tools with read-only hints", async () => {
    const r = (await handleBody({ jsonrpc: "2.0", id: 3, method: "tools/list" }, tools, info)) as { result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] } };
    expect(r.result.tools.map((t) => [t.name, t.annotations.readOnlyHint])).toEqual([["echo", true], ["boom", false]]);
  });
  it("calls a tool; bad arguments and failures come back as tool errors", async () => {
    const ok = (await handleBody({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "echo", arguments: { text: "hey" } } }, tools, info)) as { result: { content: { text: string }[] } };
    expect(JSON.parse(ok.result.content[0].text)).toEqual({ said: "hey" });
    const miss = (await handleBody({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "echo", arguments: {} } }, tools, info)) as { result: { isError: boolean; content: { text: string }[] } };
    expect(miss.result).toMatchObject({ isError: true, content: [{ text: "missing text" }] });
    const extra = (await handleBody({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "echo", arguments: { text: "x", evil: 1 } } }, tools, info)) as { result: { isError: boolean } };
    expect(extra.result.isError).toBe(true);
    const boom = (await handleBody({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "boom", arguments: {} } }, tools, info)) as { result: { isError: boolean; content: { text: string }[] } };
    expect(boom.result).toMatchObject({ isError: true, content: [{ text: "nope" }] });
  });
  it("unknown methods and tools are errors; batches work", async () => {
    const r = (await handleBody([{ jsonrpc: "2.0", id: 8, method: "nope" }, { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "x" } }, { jsonrpc: "2.0", method: "notifications/x" }], tools, info)) as { error: { code: number } }[];
    expect(r.map((x) => x.error.code)).toEqual([-32601, -32602]);
    expect(await handleBody("junk", tools, info)).toMatchObject({ error: { code: -32700 } });
  });
});
