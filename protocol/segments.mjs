/**
 * BarkSDK — Segment types
 *
 * Replaces: TextBlock, ThinkingBlock, ToolUseBlock, ToolResultBlock
 * Zero overlap with NTR SDK or Claude Agent SDK block types.
 *
 * Segments are the leaf-level content units inside a ReplyPackage or
 * OutboundPacket. Each has a distinct semantic role in the streaming chat.
 */

// ── WordChunk (replaces TextBlock) ─────────────────────────────────────
//
// A contiguous piece of generated text from the model. Multiple WordChunks
// are streamed progressively as the model produces tokens.

export class WordChunk {
  /**
   * @param {object} [src]
   * @param {string} [src.text]
   */
  constructor(src = {}) {
    /** @type {string} */
    this.text = src.text || "";
  }
}


// ── ReasonSegment (replaces ThinkingBlock) ─────────────────────────────
//
// Reasoning / thinking trace emitted by reasoning models (DeepSeek-R1,
// Kimi K2 thinking mode, GLM-5 with reasoning, etc.). Displayed separately
// from the main text in the BarkIDE chat panel.

export class ReasonSegment {
  /**
   * @param {object} [src]
   * @param {string} [src.text]
   */
  constructor(src = {}) {
    /** @type {string} */
    this.text = src.text || "";
  }
}


// ── ActionRequest (replaces ToolUseBlock) ──────────────────────────────
//
// The model wants to call a registered tool/function. Carries the tool
// identifier and parsed argument object.

export class ActionRequest {
  /**
   * @param {object} [src]
   * @param {string} [src.ref]       - unique call id (matches ActionResult.ref)
   * @param {string} [src.label]     - tool/function name
   * @param {object} [src.params]    - parsed arguments
   */
  constructor(src = {}) {
    /** @type {string} */
    this.ref = src.ref || "";
    /** @type {string} */
    this.label = src.label || "";
    /** @type {object} */
    this.params = src.params || {};
  }
}


// ── ActionResult (replaces ToolResultBlock) ────────────────────────────
//
// The result of executing a tool call. Fed back to the model in the next
// round of the action cycle.

export class ActionResult {
  /**
   * @param {object} [src]
   * @param {string} [src.ref]        - matches ActionRequest.ref
   * @param {string} [src.outcome]    - tool output text
   * @param {boolean} [src.failed]
   */
  constructor(src = {}) {
    /** @type {string} */
    this.ref = src.ref || "";
    /** @type {string} */
    this.outcome = src.outcome || "";
    /** @type {boolean} */
    this.failed = src.failed === true;
  }
}
