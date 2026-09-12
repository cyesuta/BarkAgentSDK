/** Codex provider backed by the Codex app-server JSON-RPC protocol. */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { TurnSummary } from "../protocol/packets.mjs";

let codexProcess = null;
let sequence = 0;
let pending = new Map();
let turnWaiters = new Map();

export function resolveCodexSpawn(env = process.env, platform = process.platform) {
  const executable = env.BARK_SERVER_EXECUTABLE?.trim();
  if (executable) {
    let args = ["app-server", "--listen", "stdio://"];
    if (env.BARK_SERVER_ARGS_JSON) {
      const parsed = JSON.parse(env.BARK_SERVER_ARGS_JSON);
      if (!Array.isArray(parsed) || parsed.some((arg) => typeof arg !== "string")) {
        throw new Error("BARK_SERVER_ARGS_JSON must be a JSON string array");
      }
      args = parsed;
    }
    return { executable, args };
  }
  const command = env.BARK_SERVER_CMD?.trim();
  if (command) {
    const parts = command.split(/\s+/);
    return { executable: parts[0], args: parts.slice(1) };
  }
  return {
    executable: platform === "win32" ? "codex.cmd" : "codex",
    args: ["app-server", "--listen", "stdio://"],
  };
}

export function buildThreadStartParams(cfg) {
  return {
    cwd: cfg.workspace || process.cwd(),
    skipGitRepoCheck: true,
    sandbox: { "workspace-write": null },
    approvalPolicy: "never",
    developerInstructions: cfg.guidance || undefined,
  };
}

export function buildTurnStartParams(threadId, prompt, cfg = {}) {
  const params = {
    threadId,
    input: [{ type: "text", text: String(prompt || "") }],
  };
  if (cfg.variant) params.model = cfg.variant;
  return params;
}

function writeFrame(frame) {
  if (!codexProcess || codexProcess.killed || !codexProcess.stdin?.writable) {
    throw new Error("Codex process not running");
  }
  codexProcess.stdin.write(`${JSON.stringify(frame)}\n`);
}

function notify(method, params = {}) {
  writeFrame({ jsonrpc: "2.0", method, params });
}

function rpcCall(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Codex RPC timeout: ${method}`));
    }, 30_000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timeout); resolve(value); },
      reject: (error) => { clearTimeout(timeout); reject(error); },
    });
    try {
      writeFrame({ jsonrpc: "2.0", id, method, params });
    } catch (error) {
      clearTimeout(timeout);
      pending.delete(id);
      reject(error);
    }
  });
}

function respondToServerRequest(message) {
  if (!message.method || message.id == null) return false;
  const result = message.method.endsWith("/requestApproval")
    ? { decision: "decline" }
    : { success: false, contentItems: [{ type: "inputText", text: "Unsupported host request" }] };
  writeFrame({ jsonrpc: "2.0", id: message.id, result });
  return true;
}

function routeNotification(method, params = {}) {
  const turnId = params.turnId || params.turn?.id;
  if (turnId) turnWaiters.get(turnId)?.(method, params);
}

function handleLine(line) {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (respondToServerRequest(message)) return;
  if (message.id != null) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  } else if (message.method) {
    routeNotification(message.method, message.params);
  }
}

async function ensureCodex() {
  if (codexProcess && !codexProcess.killed && codexProcess.exitCode == null) return;
  pending = new Map();
  turnWaiters = new Map();
  const { executable, args } = resolveCodexSpawn(process.env, process.platform);
  codexProcess = spawn(executable, args, {
    stdio: ["pipe", "pipe", "pipe"], env: { ...process.env }, windowsHide: true,
  });
  createInterface({ input: codexProcess.stdout }).on("line", handleLine);
  codexProcess.stderr.on("data", (data) => process.stderr.write(`[codex] ${data}`));
  codexProcess.on("exit", () => {
    const error = new Error("Codex process exited");
    for (const request of pending.values()) request.reject(error);
    for (const waiter of turnWaiters.values()) waiter("process/exited", {});
    pending.clear();
    turnWaiters.clear();
    codexProcess = null;
  });
  await new Promise((resolve, reject) => {
    codexProcess.once("spawn", resolve);
    codexProcess.once("error", reject);
  });
  await rpcCall("initialize", {
    clientInfo: { name: "bark-agent-sdk", title: "Bark Agent SDK", version: "0.2.27" },
    capabilities: { experimentalApi: true },
  });
  notify("initialized", {});
}

function waitForTurn(turnId, signal, onEvent) {
  return new Promise((resolve, reject) => {
    let text = "";
    let usage = {};
    const cleanup = () => {
      turnWaiters.delete(turnId);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      notify("turn/interrupt", { turnId });
      cleanup();
      reject(new Error("aborted"));
    };
    turnWaiters.set(turnId, (method, params) => {
      if (method === "item/agentMessage/delta" && params.delta) {
        text += params.delta;
        onEvent("text", params.delta);
      } else if (method === "item/reasoning/textDelta" && params.delta) {
        onEvent("reason", params.delta);
      } else if (method === "item/completed" && params.item?.type === "agentMessage" && !text) {
        const completed = params.item.text || params.item.content || "";
        if (completed) { text = completed; onEvent("text", completed); }
      } else if (method === "thread/tokenUsage/updated") {
        usage = params.tokenUsage?.last || params.tokenUsage || usage;
      } else if (method === "turn/completed") {
        cleanup();
        resolve({ text, usage });
      } else if (method === "turn/failed") {
        cleanup();
        reject(new Error(params.error?.message || params.turn?.error?.message || "Codex turn failed"));
      } else if (method === "process/exited") {
        cleanup();
        reject(new Error("Codex process exited"));
      }
    });
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

function lastUserPrompt(messages) {
  const last = [...(Array.isArray(messages) ? messages : [])].reverse()
    .find((message) => message?.role === "user");
  return typeof last?.content === "string" ? last.content : JSON.stringify(last?.content || "");
}

export async function runCodex(cfg, signal, onEvent, messages) {
  const startedAt = Date.now();
  try {
    await ensureCodex();
    const threadResult = await rpcCall("thread/start", buildThreadStartParams(cfg));
    const threadId = threadResult?.thread?.id;
    if (!threadId) throw new Error("Codex thread/start response missing thread.id");
    const prompt = lastUserPrompt(messages);
    const turnResult = await rpcCall("turn/start", buildTurnStartParams(threadId, prompt, cfg));
    const turnId = turnResult?.turn?.id;
    if (!turnId) throw new Error("Codex turn/start response missing turn.id");
    const completed = await waitForTurn(turnId, signal, onEvent);
    if (completed.text && Array.isArray(messages)) {
      messages.push({ role: "assistant", content: completed.text });
    }
    const usage = completed.usage || {};
    const cachedInput = usage.cachedInputTokens || 0;
    const cacheWrite = usage.cacheWriteInputTokens || 0;
    return new TurnSummary({
      ok: true,
      tokensIn: Math.max(0, (usage.inputTokens || 0) - cachedInput - cacheWrite),
      tokensOut: usage.outputTokens || 0,
      tokensCache: cachedInput,
      tokensCacheWrite: cacheWrite,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    return new TurnSummary({ ok: false, fault: `Codex error: ${error.message}` });
  }
}

export function killCodex() {
  if (codexProcess && !codexProcess.killed) codexProcess.kill();
  codexProcess = null;
  pending.clear();
  turnWaiters.clear();
}
