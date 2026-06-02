/**
 * BarkSDK — WorkspaceVault (replaces WorkspaceState)
 *
 * Per-workspace state container. Each active chat workspace gets one vault
 * that holds the engine instance, in-flight task handle, and turn-level
 * metadata (images, date anchor, provider last used).
 *
 * Zero overlap with NTR SDK's `WorkspaceState` class.
 */

// ── Vault (per-workspace) ──────────────────────────────────────────────

export class WorkspaceVault {
  constructor() {
    /** @type {import('../core/engine.mjs').BarkEngine | null} */
    this.motor = null;
    /** @type {Promise | null} */
    this.running = null;
    /** @type {boolean} */
    this.silenced = false;
    /** @type {boolean} */
    this.faulted = false;
    /** @type {string | null} */
    this.channel = null;
    /** @type {string | null} */
    this.endpoint = null;
    /** @type {string | null} */
    this.workspace = null;
    /**
     * Live image map — mutated in place each turn.
     * @type {Record<string, {mediaType: string, content: string}>}
     */
    this.pictures = {};
    /** @type {string | null} */
    this.dayAnchor = null;
    /** @type {string | null} */
    this.variant = null;
    /**
     * Rolling OpenAI-format conversation state for this workspace. System
     * prompts are rebuilt per turn and intentionally excluded; user,
     * assistant, tool_calls, and tool results stay structured here.
     * @type {Array<object>}
     */
    this.messages = [];
  }

  /** True if this vault has an active engine. */
  get active() {
    return this.motor !== null;
  }

  /** True if a turn is currently streaming. */
  get busy() {
    return this.running !== null;
  }
}


// ── Global vault registry (replaces `workspaces` dict) ─────────────────

/** @type {Map<string, WorkspaceVault>} */
export const vaults = new Map();


/**
 * Get or create a vault for the given workspace ID.
 * @param {string} id
 * @returns {WorkspaceVault}
 */
export function obtainVault(id) {
  let v = vaults.get(id);
  if (!v) {
    v = new WorkspaceVault();
    vaults.set(id, v);
  }
  return v;
}


/**
 * Drop a vault (reset / cleanup).
 * @param {string} id
 */
export function dropVault(id) {
  const v = vaults.get(id);
  if (v) {
    if (v.motor) {
      try { v.motor.scrap(); } catch { /* ignore */ }
    }
    vaults.delete(id);
  }
}
