/**
 * BarkSDK — TriggerRule (replaces HookMatcher)
 *
 * A pattern-based rule that fires a callback when a named event occurs
 * during the action cycle. Used for custom hooks / intercepts.
 *
 * Zero overlap with NTR SDK's `HookMatcher` or Claude Agent SDK's lifecycle hooks.
 */

/**
 * @typedef {object} TriggerSpec
 * @property {string} event — event name to match
 * @property {RegExp|string} [pattern] — optional content pattern
 * @property {Function} handler — async (context) => void
 */

export class TriggerRule {
  /**
   * @param {TriggerSpec} spec
   */
  constructor(spec) {
    this.event = spec.event;
    this.pattern = spec.pattern instanceof RegExp ? spec.pattern
                  : typeof spec.pattern === "string" ? new RegExp(spec.pattern)
                  : null;
    this.handler = spec.handler;
  }

  /**
   * Test whether this rule matches an event.
   * @param {string} eventName
   * @param {*} data
   * @returns {boolean}
   */
  matches(eventName, data) {
    if (this.event !== eventName) return false;
    if (this.pattern) {
      const str = typeof data === "string" ? data : JSON.stringify(data);
      return this.pattern.test(str);
    }
    return true;
  }

  /**
   * Execute the handler.
   * @param {object} context
   */
  async fire(context) {
    await this.handler(context);
  }
}


/**
 * Trigger registry — holds all registered rules for a workspace.
 */
export class TriggerBoard {
  constructor() {
    /** @type {TriggerRule[]} */
    this.rules = [];
  }

  /**
   * Register a new rule.
   * @param {TriggerSpec} spec
   */
  add(spec) {
    this.rules.push(new TriggerRule(spec));
  }

  /**
   * Fire all matching rules for an event.
   * @param {string} eventName
   * @param {*} data
   * @param {object} context
   */
  async fireMatching(eventName, data, context) {
    for (const rule of this.rules) {
      if (rule.matches(eventName, data)) {
        await rule.fire(context);
      }
    }
  }
}
