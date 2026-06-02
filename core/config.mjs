/**
 * BarkSDK — BarkConfig (replaces ClaudeAgentOptions)
 *
 * Immutable configuration bag carried through the provider dispatch chain.
 * Zero overlap with NTR SDK's ClaudeAgentOptions dataclass.
 *
 * Fields are frozen after construction; intentional — config snapshots
 * must not be mutated mid-turn.
 */

export class BarkConfig {
  /**
   * @param {object} [src]
   * @param {string} [src.guidance]      — system prompt (replaces system_prompt)
   * @param {string} [src.workspace]     — working directory (replaces cwd)
   * @param {string} [src.variant]       — model name (replaces model)
   * @param {string} [src.channel]       — provider alias (replaces provider)
   * @param {Array<string>} [src.abilities] — skill name list (replaces skills)
   * @param {object} [src.actionHubs]    — MCP server map (replaces mcp_servers)
   * @param {boolean} [src.allowThinking] — reasoning toggle
   * @param {string} [src.apiKey]
   * @param {string} [src.apiKeyEnv]
   * @param {string} [src.endpoint]
   * @param {string} [src.endpointEnv]
   */
  constructor(src = {}) {
    this.guidance = src.guidance || "";
    this.workspace = src.workspace || "";
    this.variant = src.variant || "";
    this.channel = src.channel || "";
    this.abilities = Array.isArray(src.abilities) ? [...src.abilities] : [];
    this.actionHubs = src.actionHubs || null;
    this.allowThinking = src.allowThinking === true;
    this.apiKey = src.apiKey || "";
    this.apiKeyEnv = src.apiKeyEnv || "";
    this.endpoint = src.endpoint || "";
    this.endpointEnv = src.endpointEnv || "";

    Object.freeze(this);
  }

  /** Convenience: merge partial overrides into a new frozen copy. */
  with(overrides) {
    return new BarkConfig({ ...this, ...overrides });
  }
}
