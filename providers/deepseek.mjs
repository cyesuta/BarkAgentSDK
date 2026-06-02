/**
 * BarkSDK — DeepSeek provider
 *
 * OpenAI-compatible chat completions provider.
 * Uses native fetch() — no external SDK dependency.
 */

import { ReplyPackage, TurnSummary } from "../protocol/packets.mjs";
import { WordChunk, ReasonSegment, ActionRequest } from "../protocol/segments.mjs";

const DEFAULT_ENDPOINT = "https://api.deepseek.com/v1/chat/completions";

/**
 * @param {import("../core/config.mjs").BarkConfig} cfg
 * @param {AbortSignal} signal
 * @param {function} onEvent — (type, data) => void
 * @param {Array} messages — OpenAI-format message array
 * @param {Array} tools — OpenAI-format tool definitions
 * @returns {Promise<TurnSummary>}
 */
export async function runDeepseek(cfg, signal, onEvent, messages, tools) {
  const apiKey = process.env.DEEPSEEK_API_KEY || cfg.apiKey || "";
  if (!apiKey) {
    return new TurnSummary({ ok: false, fault: "DeepSeek API key not set (DEEPSEEK_API_KEY)" });
  }

  const baseUrl = process.env.DEEPSEEK_BASE_URL || DEFAULT_ENDPOINT;

  const body = {
    model: cfg.variant || "deepseek-chat",
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  // Enable DeepSeek thinking mode when the user turned on the thinking
  // toggle.  Without this, deepseek-chat V3 may still output reasoning
  // wrapped in <think> tags inside `content` rather than using the
  // dedicated `reasoning_content` field — parseOpenAIStream handles both
  // patterns, but the dedicated field is cleaner.
  if (cfg.allowThinking) {
    body.enable_thinking = true;
  }

  try {
    const resp = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return new TurnSummary({ ok: false, fault: `DeepSeek HTTP ${resp.status}: ${errText.slice(0, 300)}` });
    }

    return await parseOpenAIStream(resp, onEvent, messages);
  } catch (err) {
    if (err.name === "AbortError") {
      return new TurnSummary({ ok: false, fault: "aborted", tokensIn: 0, tokensOut: 0 });
    }
    return new TurnSummary({ ok: false, fault: `DeepSeek error: ${err.message}` });
  }
}


/**
 * Parse an OpenAI-compatible SSE stream into events.
 * Shared across Tides, Pine, Reed, Elm, Oak, Bamboo.
 *
 * @param {Response} resp
 * @param {function} onEvent
 * @returns {Promise<TurnSummary>}
 */
export async function parseOpenAIStream(resp, onEvent, messages = null) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let tokensIn = 0, tokensOut = 0, tokensCache = 0;
  let assistantText = "";
  const toolCallsByIdx = {};

  // ── Reasoning accumulator ────────────────────────────────────────────
  // Collects ALL reasoning tokens (whether from the dedicated
  // `reasoning_content` delta field or from `<think>` tags embedded in
  // `content`) and emits ONE "reason" event when reasoning ends.
  let reasoningAccum = "";
  let reasoningFlushed = false;
  let reasoningDetailsText = "";

  // ── <think> tag state machine ────────────────────────────────────────
  // DeepSeek-Chat V3 (and some other Chinese providers) emit reasoning
  // wrapped in `<think>…</think>` inside `delta.content` instead of
  // using the dedicated `reasoning_content` field.  We detect these tags
  // in the streaming content and route the enclosed text to the reasoning
  // accumulator so the chat UI renders ONE thinking block — not dozens of
  // individual-token text bubbles.
  let insideThinkTag = false;
  let thinkTagBuf = "";   // partial tag buffer for cross-chunk detection

  const flushReasoning = () => {
    if (reasoningFlushed || !reasoningAccum) return;
    onEvent("reason", reasoningAccum);
    reasoningFlushed = true;
  };

  /**
   * Process a content token that might contain `<think>` / `</think>`.
   * Text inside the tags is routed to `reasoningAccum`; text outside is
   * emitted as a normal "text" event.
   */
  const processContent = (text) => {
    // Fast path: no think-tag state and no tag markers in this chunk
    if (!insideThinkTag && !thinkTagBuf && !text.includes("<")) {
      flushReasoning();
      assistantText += text;
      onEvent("text", text);
      return;
    }

    // Prepend any buffered partial tag from a previous chunk
    const input = thinkTagBuf + text;
    thinkTagBuf = "";

    let cursor = 0;
    while (cursor < input.length) {
      if (insideThinkTag) {
        // Look for </think>
        const closeIdx = input.indexOf("</think>", cursor);
        if (closeIdx === -1) {
          // Check if we might have a partial </think> at the end
          const tail = input.slice(cursor);
          if (tail.length < 8 && "</think>".startsWith(tail)) {
            thinkTagBuf = tail;
          } else {
            // Check if tail ends with a partial match
            let partialLen = Math.min(tail.length, 7);
            while (partialLen > 0) {
              if ("</think>".startsWith(tail.slice(tail.length - partialLen))) break;
              partialLen--;
            }
            if (partialLen > 0) {
              reasoningAccum += tail.slice(0, tail.length - partialLen);
              thinkTagBuf = tail.slice(tail.length - partialLen);
            } else {
              reasoningAccum += tail;
            }
          }
          cursor = input.length;
        } else {
          // Found </think> — accumulate text before it, then exit think mode
          reasoningAccum += input.slice(cursor, closeIdx);
          insideThinkTag = false;
          cursor = closeIdx + 8; // length of "</think>"
        }
      } else {
        // Look for <think>
        const openIdx = input.indexOf("<think>", cursor);
        if (openIdx === -1) {
          // Check for partial <think> at end of input
          const tail = input.slice(cursor);
          let partialLen = Math.min(tail.length, 6);
          while (partialLen > 0) {
            if ("<think>".startsWith(tail.slice(tail.length - partialLen))) break;
            partialLen--;
          }
          if (partialLen > 0) {
            const textPart = tail.slice(0, tail.length - partialLen);
            if (textPart) {
              flushReasoning();
              assistantText += textPart;
              onEvent("text", textPart);
            }
            thinkTagBuf = tail.slice(tail.length - partialLen);
          } else {
            if (tail) {
              flushReasoning();
              assistantText += tail;
              onEvent("text", tail);
            }
          }
          cursor = input.length;
        } else {
          // Emit text before <think> as normal text
          const before = input.slice(cursor, openIdx);
          if (before) {
            flushReasoning();
            assistantText += before;
            onEvent("text", before);
          }
          insideThinkTag = true;
          cursor = openIdx + 7; // length of "<think>"
        }
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith(":")) continue;          // comment / heartbeat
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;

        let chunk;
        try { chunk = JSON.parse(payload); } catch { continue; }

        // Usage in final chunk
        if (chunk.usage) {
          tokensIn = chunk.usage.prompt_tokens || 0;
          tokensOut = chunk.usage.completion_tokens || 0;
          const details = chunk.usage.prompt_tokens_details;
          tokensCache = (details && details.cached_tokens) || 0;
        }

        const choice = chunk.choices && chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta || {};

        // Dedicated reasoning field (deepseek-reasoner: reasoning_content,
        // Ollama: reasoning, MiniMax: reasoning_details). All accumulate
        // into the same buffer.
        const reasoningDelta = delta.reasoning_content || delta.reasoning;
        if (typeof reasoningDelta === "string" && reasoningDelta) {
          reasoningAccum += reasoningDelta;
        }
        if (Array.isArray(delta.reasoning_details)) {
          for (const detail of delta.reasoning_details) {
            const text = detail && typeof detail.text === "string" ? detail.text : "";
            if (!text) continue;
            if (text.startsWith(reasoningDetailsText)) {
              reasoningAccum += text.slice(reasoningDetailsText.length);
            } else {
              reasoningAccum += text;
            }
            reasoningDetailsText = text;
          }
        }

        // Content — may contain <think> tags that need routing
        if (typeof delta.content === "string" && delta.content) {
          processContent(delta.content);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallsByIdx[idx]) {
              toolCallsByIdx[idx] = {
                id: "",
                type: "function",
                function: { name: "", arguments: "" },
              };
            }
            if (tc.id) toolCallsByIdx[idx].id = tc.id;
            if (tc.type) toolCallsByIdx[idx].type = tc.type;
            if (tc.function?.name) toolCallsByIdx[idx].function.name += tc.function.name;
            if (tc.function?.arguments) toolCallsByIdx[idx].function.arguments += tc.function.arguments;
          }
        }
      }
    }

    // If we were still inside a <think> tag when the stream ended, flush
    // whatever was buffered (including any partial tag buffer).
    if (thinkTagBuf) {
      if (insideThinkTag) {
        reasoningAccum += thinkTagBuf;
      } else {
        assistantText += thinkTagBuf;
        onEvent("text", thinkTagBuf);
      }
      thinkTagBuf = "";
    }

    // Flush any remaining reasoning before final buffer cleanup
    flushReasoning();

    // Flush remaining buffer line
    if (buffer.trim()) {
      const line = buffer.trim();
      if (line.startsWith("data: ")) {
        const payload = line.slice(6).trim();
        if (payload !== "[DONE]") {
          try {
            const chunk = JSON.parse(payload);
            if (chunk.usage) {
              tokensIn = chunk.usage.prompt_tokens || tokensIn;
              tokensOut = chunk.usage.completion_tokens || tokensOut;
            }
          } catch { /* skip */ }
        }
      }
    }
  } catch (err) {
    if (err.name === "AbortError") throw err;
    // Stream interrupted — flush partial reasoning, still return partial usage
    if (thinkTagBuf) {
      if (insideThinkTag) reasoningAccum += thinkTagBuf;
      thinkTagBuf = "";
    }
    flushReasoning();
  }

  const toolCalls = Object.keys(toolCallsByIdx)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => toolCallsByIdx[k])
    .filter((tc) => tc.id && tc.function.name);
  if (Array.isArray(messages) && (assistantText || toolCalls.length > 0)) {
    const msg = { role: "assistant", content: assistantText || null };
    if (reasoningAccum) msg.reasoning_content = reasoningAccum;
    if (toolCalls.length > 0) msg.tool_calls = toolCalls;
    messages.push(msg);
  }

  return new TurnSummary({
    ok: true,
    tokensIn,
    tokensOut,
    tokensCache,
  });
}


function safeParseJSON(str) {
  try { return JSON.parse(str); } catch { return {}; }
}
