import { describe, it, expect } from "vitest";
import { SseParser } from "../../src/lib/parseSSE";

describe("SseParser", () => {
  it("parses a single complete event in one chunk", () => {
    const p = new SseParser();
    const frames = p.feed("event: text\ndata: {\"chunk\":\"hello\"}\n\n");
    expect(frames).toEqual([{ event: "text", data: '{"chunk":"hello"}' }]);
  });

  it("buffers an incomplete frame and emits when the boundary arrives", () => {
    const p = new SseParser();
    expect(p.feed("event: text\ndata: {\"chunk\"")).toEqual([]);
    expect(p.feed(":\"hello\"}\n\n")).toEqual([
      { event: "text", data: '{"chunk":"hello"}' },
    ]);
  });

  it("parses multiple events in one chunk", () => {
    const p = new SseParser();
    const frames = p.feed(
      "event: text\ndata: {\"chunk\":\"a\"}\n\n" +
        "event: tool_call\ndata: {\"id\":\"c1\",\"name\":\"search_deals\",\"arguments\":\"{}\"}\n\n",
    );
    expect(frames).toHaveLength(2);
    expect(frames[0].event).toBe("text");
    expect(frames[1].event).toBe("tool_call");
  });

  it("defaults event to 'message' when only data: is present", () => {
    const p = new SseParser();
    const frames = p.feed("data: {\"x\":1}\n\n");
    expect(frames).toEqual([{ event: "message", data: '{"x":1}' }]);
  });

  it("ignores comment lines starting with ':'", () => {
    const p = new SseParser();
    const frames = p.feed(": keepalive\nevent: done\ndata: {}\n\n");
    expect(frames).toEqual([{ event: "done", data: "{}" }]);
  });

  it("joins multi-line data: with newlines", () => {
    const p = new SseParser();
    const frames = p.feed("event: text\ndata: line1\ndata: line2\n\n");
    expect(frames).toEqual([{ event: "text", data: "line1\nline2" }]);
  });

  it("flush emits any trailing partial event with data:", () => {
    const p = new SseParser();
    p.feed("event: done\ndata: {}");
    const flushed = p.flush();
    expect(flushed).toEqual([{ event: "done", data: "{}" }]);
  });
});
