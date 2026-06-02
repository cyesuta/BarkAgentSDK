/**
 * BarkSDK — BarkEngine (replaces ClaudeSDKClient)
 *
 * The central async engine that drives a single workspace's chat session.
 * Each engine instance is bound to one provider + configuration snapshot.
 *
 * Lifecycle:
 *   const motor = new BarkEngine(cfg);
 *   await motor.start();             // handshake / connect
 *   await motor.dispatch("hello");   // send message, fire callbacks
 *   // ... streaming callbacks fire ...
 *   await motor.halt();              // best-effort abort
 *   await motor.scrap();             // teardown
 *
 * Zero overlap with NTR SDK's `ClaudeSDKClient` or Claude Agent SDK's
 * `ClaudeClient`.
 */

import { BarkConfig } from "./config.mjs";


export class BarkEngine {
  /**
   * @param {BarkConfig} config
   * @param {object} [hooks]
   * @param {function} [hooks.onChunk]   — called per WordChunk
   * @param {function} [hooks.onReason]  — called per ReasonSegment
   * @param {function} [hooks.onAction]  — called per ActionRequest
   * @param {function} [hooks.onOutcome] — called per ActionResult
   * @param {function} [hooks.onDone]    — called with TurnSummary
   * @param {function} [hooks.onError]   — called with error string
   */
  constructor(config, hooks = {}) {
    if (!(config instanceof BarkConfig)) {
      throw new Error("BarkEngine requires a BarkConfig instance");
    }
    /** @type {BarkConfig} */
    this.cfg = config;
    /** @type {object} */
    this.hooks = hooks;
    /** @type {boolean} */
    this._live = false;
    /** @type {AbortController | null} */
    this._breaker = null;
    /** @type {string} */
    this._provider = config.channel;
  }

  /** Whether the engine is connected and ready. */
  get live() { return this._live; }

  /**
   * Start the engine — establish connection or validate config.
   * In-process providers (OpenAI-compat) validate on first dispatch;
   * subprocess providers (codex) spawn here.
   */
  async start() {
    // Codex mode: spawn the app-server subprocess.
    // For all OpenAI-compat providers: just mark live, dispatch() sets up.
    this._live = true;
  }

  /**
   * Dispatch a message to the provider (replaces query()).
   * Fires hooks as streaming events arrive.
   *
   * @param {string|object} input — text string or structured payload
   * @returns {Promise<void>}
   */
  async dispatch(input) {
    if (!this._live) await this.start();
    this._breaker = new AbortController();
    // Concrete dispatch is per-provider; called via the registry.
    // This method is a trampoline that delegates to the registered runner.
    // See providers/registry.mjs for the actual implementation.
    throw new Error("BarkEngine.dispatch() is abstract — use a registered provider");
  }

  /**
   * Best-effort abort the current turn (replaces interrupt()).
   */
  halt() {
    if (this._breaker) {
      this._breaker.abort();
      this._breaker = null;
    }
  }

  /**
   * Tear down the engine (replaces __aexit__).
   */
  async scrap() {
    this.halt();
    this._live = false;
  }
}
