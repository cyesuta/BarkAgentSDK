/**
 * BarkSDK — Gemini provider
 *
 * Google Gemini API via native fetch().
 * Uses generateContent streaming endpoint.
 */

import { TurnSummary } from "../protocol/packets.mjs";

const DEFAULT_MODEL = "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * @param {import("../core/config.mjs").BarkConfig} cfg
 * @param {AbortSignal} signal
 * @param {function} onEvent
 * @param {Array} messages — OpenAI-format messages, converted to Gemini format
 * @returns {Promise<TurnSummary>}
 */
export async function runGemini(cfg, signal, onEvent, messages) {
  const apiKey = cfg.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!apiKey) {
    return new TurnSummary({ ok: false, fault: "Gemini API key not set (GEMINI_API_KEY / GOOGLE_API_KEY)" });
  }

  const model = cfg.variant || DEFAULT_MODEL;
  const url = `${API_BASE}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const geminiContents = convertToGeminiFormat(messages);

  const body = {
    contents: geminiContents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
  };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return new TurnSummary({ ok: false, fault: `Gemini HTTP ${resp.status}: ${errText.slice(0, 300)}` });
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let tokensIn = 0, tokensOut = 0;
    let fullText = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const raw of lines) {
          const line = raw.trim();
          if (!line || !line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === "[DONE]") continue;

          let chunk;
          try { chunk = JSON.parse(payload); } catch { continue; }

          const candidates = chunk.candidates || [];
          for (const c of candidates) {
            const parts = c.content?.parts || [];
            for (const p of parts) {
              if (p.text) {
                fullText += p.text;
                onEvent("text", p.text);
              }
            }
            // Usage from finish reason
            if (c.finishReason) {
              // Gemini doesn't stream usage — estimate from text length
              tokensOut = Math.ceil(fullText.length / 4);
            }
          }
          if (chunk.usageMetadata) {
            tokensIn = chunk.usageMetadata.promptTokenCount || 0;
            tokensOut = chunk.usageMetadata.candidatesTokenCount || tokensOut;
          }
        }
      }
    } catch (err) {
      if (err.name === "AbortError") throw err;
    }

    if (fullText && Array.isArray(messages)) {
      messages.push({ role: "assistant", content: fullText });
    }

    return new TurnSummary({
      ok: true,
      tokensIn,
      tokensOut,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      return new TurnSummary({ ok: false, fault: "aborted" });
    }
    return new TurnSummary({ ok: false, fault: `Gemini error: ${err.message}` });
  }
}


/**
 * Convert OpenAI-format messages to Gemini contents format.
 * @param {Array} messages
 * @returns {Array}
 */
function convertToGeminiFormat(messages) {
  const roleMap = {
    user: "user",
    assistant: "model",
    system: "user",
    tool: "function",
  };

  return messages.map((msg) => {
    const parts = [];
    if (typeof msg.content === "string" && msg.content) {
      parts.push({ text: msg.content });
    }
    // Handle tool calls from assistant
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        parts.push({
          functionCall: {
            name: tc.function.name,
            args: safeParseJSON(tc.function.arguments),
          },
        });
      }
    }
    // Handle tool results
    if (msg.role === "tool") {
      parts.push({
        functionResponse: {
          name: msg.tool_call_id || "unknown",
          response: { result: msg.content },
        },
      });
    }

    return {
      role: roleMap[msg.role] || "user",
      parts,
    };
  }).filter((c) => c.parts.length > 0);
}


function safeParseJSON(str) {
  try { return JSON.parse(str); } catch { return {}; }
}
