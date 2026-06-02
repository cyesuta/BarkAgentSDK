/**
 * BarkSDK — Packet types
 *
 * Replaces: AssistantMessage, UserMessage, SystemMessage, ResultMessage
 * Zero overlap with NTR SDK (`claude_agent_sdk`) or Claude Agent SDK
 * (`@anthropic-ai/claude-agent-sdk`).
 *
 * Packets are the high-level semantic containers that flow through the
 * provider streaming loop. Each carries zero or more Segments (WordChunk,
 * ReasonSegment, ActionRequest, ActionResult).
 */

// ── ReplyPackage (replaces AssistantMessage) ────────────────────────────
//
// Emitted by the provider when the model produces content. May carry text
// chunks, reasoning traces, or action requests. The `.items` array holds
// the parsed segments.

export class ReplyPackage {
  /**
   * @param {object} [src]
   * @param {Array}  [src.items] - array of WordChunk | ReasonSegment | ActionRequest
   */
  constructor(src = {}) {
    /** @type {Array} */
    this.items = src.items || [];
  }

  /** Convenience: concatenate all WordChunk texts. */
  get fullText() {
    return this.items
      .filter((s) => s.constructor?.name === "WordChunk")
      .map((s) => s.text)
      .join("");
  }
}


// ── OutboundPacket (replaces UserMessage) ──────────────────────────────
//
// Carries user input TO the model loop. May include tool results that need
// to be fed back as the next turn's context.

export class OutboundPacket {
  /**
   * @param {object} [src]
   * @param {string} [src.text]
   * @param {Array}  [src.toolResults] - array of ActionResult
   */
  constructor(src = {}) {
    /** @type {string} */
    this.text = src.text || "";
    /** @type {Array<ActionResult>} */
    this.toolResults = src.toolResults || [];
  }
}


// ── SystemSignal (replaces SystemMessage) ──────────────────────────────
//
// Injected system-level information (init status, MCP server list,
// environment diagnostics). Not forwarded to the chat panel — logged only.

export class SystemSignal {
  /**
   * @param {object} [src]
   * @param {string} [src.category]
   * @param {string} [src.body]
   */
  constructor(src = {}) {
    /** @type {string} */
    this.category = src.category || "info";
    /** @type {string} */
    this.body = src.body || "";
  }
}


// ── TurnSummary (replaces ResultMessage) ───────────────────────────────
//
// Signals the end of a single turn. Carries aggregated token usage,
// cost estimate, and success / error status.

export class TurnSummary {
  /**
   * @param {object} [src]
   * @param {boolean} [src.ok]
   * @param {string}  [src.fault]
   * @param {number}  [src.tokensIn]
   * @param {number}  [src.tokensOut]
   * @param {number}  [src.tokensCache]
   * @param {number}  [src.charge]
   * @param {number}  [src.rounds]
   */
  constructor(src = {}) {
    /** @type {boolean} */
    this.ok = src.ok !== false;
    /** @type {string} */
    this.fault = src.fault || "";
    /** @type {number} */
    this.tokensIn = src.tokensIn || 0;
    /** @type {number} */
    this.tokensOut = src.tokensOut || 0;
    /** @type {number} */
    this.tokensCache = src.tokensCache || 0;
    /** @type {number} */
    this.charge = src.charge || 0;
    /** @type {number} */
    this.rounds = src.rounds || 0;
  }
}
