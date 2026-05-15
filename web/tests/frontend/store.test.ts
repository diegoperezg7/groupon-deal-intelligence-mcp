import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useChatStore } from "../../src/store/chat";

/**
 * Simulate an SSE response from the BFF. Returns a Response whose body
 * yields the given frames as a single chunk.
 */
function fakeSseResponse(frames: { event: string; data: unknown }[]): Response {
  const body = frames
    .map((f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`)
    .join("");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("useChatStore.send", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("appends user + assistant messages and accumulates text chunks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeSseResponse([
          { event: "text", data: { chunk: "Hello, " } },
          { event: "text", data: { chunk: "world." } },
          { event: "done", data: {} },
        ]),
      ),
    );

    await useChatStore.getState().send("Hi");

    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toBe("Hi");
    expect(msgs[1].role).toBe("assistant");
    expect(msgs[1].content).toBe("Hello, world.");
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  it("records tool calls and their results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeSseResponse([
          { event: "tool_call", data: { id: "c1", name: "search_deals", arguments: '{"query":"spa"}' } },
          { event: "tool_result", data: { id: "c1", name: "search_deals", ok: true, snippet: "3 results" } },
          { event: "text", data: { chunk: "Here are some deals." } },
          { event: "done", data: {} },
        ]),
      ),
    );

    await useChatStore.getState().send("find spa deals");

    const assistant = useChatStore.getState().messages.at(-1)!;
    expect(assistant.toolCalls).toHaveLength(1);
    expect(assistant.toolCalls[0]).toMatchObject({
      id: "c1",
      name: "search_deals",
      status: "ok",
      snippet: "3 results",
    });
    expect(assistant.content).toBe("Here are some deals.");
  });

  it("surfaces an error event into the store", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeSseResponse([
          { event: "error", data: { message: "LLM rate-limited" } },
          { event: "done", data: {} },
        ]),
      ),
    );

    await useChatStore.getState().send("hello");
    expect(useChatStore.getState().error).toBe("LLM rate-limited");
  });

  it("refuses to send while a stream is already in flight", async () => {
    let resolve: (r: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () => new Promise<Response>((res) => (resolve = res)),
      ),
    );

    const promise = useChatStore.getState().send("first");
    expect(useChatStore.getState().isStreaming).toBe(true);
    await useChatStore.getState().send("second"); // should no-op
    expect(useChatStore.getState().messages.filter((m) => m.role === "user")).toHaveLength(1);

    resolve(fakeSseResponse([{ event: "done", data: {} }]));
    await promise;
  });

  it("ignores empty input", async () => {
    await useChatStore.getState().send("   ");
    expect(useChatStore.getState().messages).toHaveLength(0);
  });
});
