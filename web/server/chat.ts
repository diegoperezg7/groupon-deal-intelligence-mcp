import type { Express, Request, Response } from "express";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions.mjs";
import { getLlmClient, getLlmModel } from "./llm.js";
import { listMcpTools, callMcpTool } from "./mcp-client.js";
import { mcpToolsToOpenAI, buildSystemPrompt } from "./tools.js";
import { logger } from "./logger.js";
import type { ChatRequestBody, SseEvent } from "./types.js";

/**
 * POST /chat — the only chat endpoint. Takes the conversation so far,
 * runs an LLM-with-tools loop against the MCP server, and streams the
 * outcome as Server-Sent Events.
 *
 * Loop terminates when:
 *   - the LLM produces a final answer (no tool calls)
 *   - the iteration cap is hit (MAX_ITERATIONS)
 *   - the client disconnects (req closes)
 *
 * xAI Grok quirk: tool-call arguments arrive in a SINGLE chunk, not as
 * argument deltas (unlike OpenAI). We accumulate either way — if deltas
 * arrive, we concatenate; if a full chunk arrives, we use it as-is.
 */

const MAX_ITERATIONS = 6;

export function registerChatRoute(app: Express): void {
  app.post("/chat", async (req: Request, res: Response) => {
    const body = req.body as ChatRequestBody;
    if (!body?.messages?.length) {
      res.status(400).json({ error: "messages is required" });
      return;
    }

    // SSE headers — flush immediately so the browser sees the stream open.
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (evt: SseEvent) => {
      res.write(`event: ${evt.event}\n`);
      res.write(`data: ${JSON.stringify(evt.data)}\n\n`);
    };

    // Track real client disconnects (vs Express 5 internal 'close'
    // emitted when the request body is consumed). We mark disconnect
    // only if the response was NOT already ended by us.
    let clientDisconnected = false;
    res.on("close", () => {
      if (!res.writableEnded) {
        clientDisconnected = true;
      }
    });

    try {
      const tools = await listMcpTools();
      const openaiTools = mcpToolsToOpenAI(tools);
      const toolNames = tools.map((t) => t.name);

      const openai = getLlmClient();
      const model = getLlmModel();

      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: buildSystemPrompt(toolNames) },
        ...body.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })) as ChatCompletionMessageParam[],
      ];

      for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        if (clientDisconnected) {
          logger.info("Client disconnected mid-stream");
          return;
        }

        logger.debug({ iter, model }, "LLM round");

        const stream = await openai.chat.completions.create({
          model,
          messages,
          tools: openaiTools,
          tool_choice: "auto",
          stream: true,
        });

        // Accumulate the streamed delta into a single assembled assistant
        // message at end of iteration.
        let textBuffer = "";
        const toolCallBuf = new Map<
          number,
          { id: string; name: string; args: string }
        >();
        let finishReason: string | null = null;

        for await (const chunk of stream) {
          if (clientDisconnected) return;
          const choice = chunk.choices?.[0];
          if (!choice) continue;
          if (choice.delta?.content) {
            const piece = choice.delta.content;
            textBuffer += piece;
            send({ event: "text", data: { chunk: piece } });
          }
          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const idx = tc.index ?? 0;
              const prev = toolCallBuf.get(idx) ?? { id: "", name: "", args: "" };
              if (tc.id) prev.id = tc.id;
              if (tc.function?.name) prev.name = tc.function.name;
              if (tc.function?.arguments) prev.args += tc.function.arguments;
              toolCallBuf.set(idx, prev);
            }
          }
          if (choice.finish_reason) finishReason = choice.finish_reason;
        }

        const assembledToolCalls: ChatCompletionMessageToolCall[] = Array.from(
          toolCallBuf.values(),
        ).map((c) => ({
          id: c.id || `call_${iter}_${c.name}`,
          type: "function" as const,
          function: { name: c.name, arguments: c.args || "{}" },
        }));

        // Append the assistant turn — content empty + tool_calls when the LLM
        // chose to invoke tools, otherwise just the final text.
        if (assembledToolCalls.length === 0) {
          // Natural finish — done.
          messages.push({ role: "assistant", content: textBuffer });
          send({ event: "done", data: {} });
          res.end();
          return;
        }

        messages.push({
          role: "assistant",
          content: textBuffer || null,
          tool_calls: assembledToolCalls,
        });

        // Resolve every tool call (sequentially — calls are small, and
        // sequential keeps the SSE stream coherent).
        for (const tc of assembledToolCalls) {
          send({
            event: "tool_call",
            data: { id: tc.id, name: tc.function.name, arguments: tc.function.arguments },
          });

          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch {
            args = {};
          }

          let resultText: string;
          let ok = true;
          try {
            const result = await callMcpTool(tc.function.name, args);
            if (result.isError) {
              ok = false;
              resultText = textFromMcpContent(result.content);
            } else if (result.structuredContent) {
              resultText = JSON.stringify(result.structuredContent);
            } else {
              resultText = textFromMcpContent(result.content);
            }
          } catch (err) {
            ok = false;
            resultText = `Tool ${tc.function.name} threw: ${(err as Error).message}`;
            logger.error({ err, name: tc.function.name }, "MCP tool call failed");
          }

          send({
            event: "tool_result",
            data: {
              id: tc.id,
              name: tc.function.name,
              ok,
              snippet: snippetOf(resultText),
            },
          });

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: ok ? resultText : `ERROR: ${resultText}`,
          });
        }

        if (finishReason === "stop") {
          // Defensive — shouldn't happen if there were tool_calls, but log.
          logger.warn("finish_reason=stop with tool_calls present");
        }
      }

      send({
        event: "error",
        data: { message: `Reached max iterations (${MAX_ITERATIONS}) without a final answer.` },
      });
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "POST /chat failed");
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      } else {
        send({ event: "error", data: { message } });
        res.end();
      }
    }
  });
}

interface McpTextContent {
  type: string;
  text?: string;
}

function textFromMcpContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return (content as McpTextContent[])
    .filter((c) => c?.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n");
}

function snippetOf(s: string, max = 300): string {
  const normalised = s.replace(/\s+/g, " ").trim();
  return normalised.length > max ? normalised.slice(0, max - 1) + "…" : normalised;
}
