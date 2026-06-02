/**
 * BarkSDK — Channel I/O
 *
 * Replaces: emit_block(), stream_response(), stdin_pump()
 * Zero overlap with NTR SDK I/O helpers.
 *
 * Manages stdin/stdout JSON-line protocol for the sidecar process.
 */

import { createInterface } from "node:readline";

// ── Stdout writer ──────────────────────────────────────────────────────

/**
 * Emit a JSON line to stdout.
 * @param {object} obj
 */
export function broadcast(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

/**
 * Log a message to stderr (prefixed).
 * @param {string} msg
 */
export function logStderr(msg) {
  process.stderr.write(`[BarkSDK] ${msg}\n`);
}


// ── Event dispatch ─────────────────────────────────────────────────────

/**
 * Route a streaming event from a provider back to the wire protocol.
 *
 * @param {string} wsId - workspace ID
 * @param {string} type - event type: "text" | "reason" | "action" | "outcome"
 * @param {*} data - payload
 */
export function dispatchEvent(wsId, type, data) {
  switch (type) {
    case "text":
      broadcast({ type: "text", workspaceId: wsId, text: String(data) });
      break;
    case "reason":
      broadcast({ type: "thinking", workspaceId: wsId, text: String(data) });
      break;
    case "action":
      broadcast({
        type: "tool_use",
        workspaceId: wsId,
        id: (data && data.ref) || "",
        name: (data && data.label) || "",
        input: (data && data.params) || {},
      });
      break;
    case "outcome":
      broadcast({
        type: "tool_result",
        workspaceId: wsId,
        id: (data && data.ref) || "",
        output: typeof data === "string" ? data : ((data && data.outcome) || ""),
        is_error: !!(data && data.failed),
      });
      break;
    default:
      logStderr(`unknown event type: ${type}`);
  }
}


// ── Stdin reader ───────────────────────────────────────────────────────

/**
 * Create an async iterator over stdin JSON lines.
 * @returns {AsyncGenerator<object, void, void>}
 */
export async function* inputPump() {
  const rl = createInterface({ input: process.stdin });

  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    try {
      yield JSON.parse(line);
    } catch (err) {
      logStderr(`bad JSON from stdin: ${err.message}; line=${line.slice(0, 160)}`);
    }
  }
}
