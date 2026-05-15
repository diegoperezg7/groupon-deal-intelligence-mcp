/**
 * Tiny incremental SSE parser. Feed it chunks of raw text from a
 * `fetch().body.getReader()` stream and it yields parsed events.
 *
 * The wire format is the standard `event: <name>\ndata: <json>\n\n`.
 * Multi-line `data:` is supported by concatenating with newlines.
 */

export interface SseFrame {
  event: string;
  data: string;
}

export class SseParser {
  private buffer = "";

  feed(chunk: string): SseFrame[] {
    this.buffer += chunk;
    const frames: SseFrame[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf("\n\n")) >= 0) {
      const rawFrame = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const frame = this.parseFrame(rawFrame);
      if (frame) frames.push(frame);
    }
    return frames;
  }

  private parseFrame(raw: string): SseFrame | undefined {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of raw.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const key = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      if (key === "event") event = value;
      else if (key === "data") dataLines.push(value);
    }
    if (dataLines.length === 0) return undefined;
    return { event, data: dataLines.join("\n") };
  }

  flush(): SseFrame[] {
    if (!this.buffer.trim()) {
      this.buffer = "";
      return [];
    }
    const frame = this.parseFrame(this.buffer);
    this.buffer = "";
    return frame ? [frame] : [];
  }
}
