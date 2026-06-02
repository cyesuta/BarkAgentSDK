/**
 * BarkSDK — Codex provider (ChatGPT OAuth)
 *
 * Spawns `codex.cmd app-server --listen stdio://` as a subprocess and
 * communicates via JSON-RPC 2.0 over its stdin/stdout.
 *
 * This is the ONLY provider that requires an external binary (codex).
 * All other providers use plain HTTP fetch().
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { TurnSummary } from "../protocol/packets.mjs";

let _codexProcess = null;
let _codexSequence = 0;
let _codexPending = new Map();

/**
 * Lazily start (or reuse) a codex subprocess.
 */
async function ensureCodex() {
  if (_codexProcess && !_codexProcess.killed) return;
  _codexPending = new Map();

  const cmd = process.env.BARK_SERVER_CMD ||
              (process.platform === "win32"
                ? "codex.cmd app-server --listen stdio://"
                : "codex app-server --listen stdio://");

  const parts = cmd.split(/\s+/);
  _codexProcess = spawn(parts[0], parts.slice(1), {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
    windowsHide: true,
  });

  const rl = createInterface({ input: _codexProcess.stdout });
  rl.on("line", (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    const { id } = msg;
    if (id != null && _codexPending.has(id)) {
      const { resolve } = _codexPending.get(id);
      _codexPending.delete(id);
      resolve(msg);
    }
  });

  _codexProcess.stderr.on("data", (d) => {
    process.stderr.write(`[codex] ${d}`);
  });

  _codexProcess.on("exit", () => {
    _codexProcess = null;
    // Reject all pending
    for (const [id, { reject }] of _codexPending) {
      reject(new Error("Codex process exited"));
    }
    _codexPending.clear();
  });

  // Await initialize handshake
  const initResult = await jsonRpcCall("initialize", {
    protocolVersion: "2025-04-01",
    clientInfo: { name: "bark-sdk", version: "0.1.0" },
  });
  if (!initResult || initResult.error) {
    throw new Error(`Codex init failed: ${JSON.stringify(initResult?.error)}`);
  }
}

/**
 * Make a JSON-RPC 2.0 call to the codex subprocess.
 */
function jsonRpcCall(method, params) {
  return new Promise((resolve, reject) => {
    if (!_codexProcess || _codexProcess.killed) {
      return reject(new Error("Codex process not running"));
    }
    const id = ++_codexSequence;
    _codexPending.set(id, { resolve, reject });
    const request = { jsonrpc: "2.0", id, method, params };
    _codexProcess.stdin.write(JSON.stringify(request) + "\n");

    // Timeout
    setTimeout(() => {
      if (_codexPending.has(id)) {
        _codexPending.delete(id);
        reject(new Error(`Codex RPC timeout: ${method}`));
      }
    }, 30000);
  });
}

/**
 * Run the Codex (codex) provider.
 * @param {import("../core/config.mjs").BarkConfig} cfg
 * @param {AbortSignal} signal
 * @param {function} onEvent
 * @param {Array} messages
 * @returns {Promise<TurnSummary>}
 */
export async function runCodex(cfg, signal, onEvent, messages) {
  try {
    await ensureCodex();
  } catch (err) {
    return new TurnSummary({ ok: false, fault: `Codex start failed: ${err.message}` });
  }

  const startTime = Date.now();
  let tokensIn = 0, tokensOut = 0;

  try {
    // Start a thread with the user message
    const lastMsg = messages[messages.length - 1] || {};
    const userText = typeof lastMsg.content === "string" ? lastMsg.content : "";

    const threadResult = await jsonRpcCall("thread/start", {
      threadId: `bark-${cfg.workspace || Date.now()}`,
      instruction: userText,
      model: cfg.variant || undefined,
      systemPrompt: cfg.guidance || undefined,
      metadata: { source: "bark-sdk" },
    });

    if (threadResult.error) {
      return new TurnSummary({ ok: false, fault: `Codex thread/start error: ${JSON.stringify(threadResult.error)}` });
    }

    const threadId = threadResult.result?.threadId || `t_${Date.now()}`;

    // Wait for turn completion (simplified — full item stream would need event parsing)
    // In a production implementation, we'd listen for turn/completed and item/* notifications.
    // For now, poll or wait for the first turn to complete.
    const turnResult = await jsonRpcCall("turn/start", {
      threadId,
      signal: signal.aborted ? undefined : undefined,
    });

    if (turnResult.error) {
      return new TurnSummary({ ok: false, fault: `Codex turn/start error: ${JSON.stringify(turnResult.error)}` });
    }

    // Handle streaming notifications — collect text from items
    const items = turnResult.result?.items || [];
    let fullText = "";

    for (const item of items) {
      if (item.type === "text" && item.content) {
        fullText += item.content;
        onEvent("text", item.content);
      } else if (item.type === "tool_use") {
        onEvent("action", {
          ref: item.id || "",
          label: item.name || "",
          params: item.input || {},
        });
      } else if (item.type === "tool_result") {
        onEvent("outcome", item.content || "");
      }
    }

    if (fullText && Array.isArray(messages)) {
      messages.push({ role: "assistant", content: fullText });
    }

    // Usage from thread token usage
    try {
      const usageResult = await jsonRpcCall("thread/tokenUsage/updated", { threadId });
      if (usageResult?.result) {
        tokensIn = usageResult.result.inputTokens || 0;
        tokensOut = usageResult.result.outputTokens || 0;
      }
    } catch { /* usage not available for all models */ }

    return new TurnSummary({
      ok: true,
      tokensIn,
      tokensOut,
    });
  } catch (err) {
    if (signal.aborted) {
      return new TurnSummary({ ok: false, fault: "aborted" });
    }
    return new TurnSummary({ ok: false, fault: `Codex error: ${err.message}` });
  }
}


/**
 * Clean up codex subprocess.
 */
export function killCodex() {
  if (_codexProcess && !_codexProcess.killed) {
    _codexProcess.kill();
    _codexProcess = null;
  }
  _codexPending.clear();
}
