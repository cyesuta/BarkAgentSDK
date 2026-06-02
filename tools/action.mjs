/**
 * BarkSDK — Action system
 *
 * defineAction()  — replaces @tool decorator
 * buildActionHub() — replaces create_sdk_mcp_server()
 *
 * Actions are function-call definitions exposed to the model via the
 * `tools` parameter of OpenAI-compatible chat completions.
 */

/**
 * Define an action (tool) specification.
 *
 * @param {string} label — action name
 * @param {string} description — what the action does
 * @param {object} inputSchema — JSON Schema for arguments
 * @param {Function} handler — async (params) => string result
 * @returns {object} — { spec, handler }
 */
export function defineAction(label, description, inputSchema, handler) {
  return {
    spec: {
      type: "function",
      function: {
        name: label,
        description,
        parameters: inputSchema,
      },
    },
    handler,
  };
}

/**
 * Build an action hub from an array of defined actions.
 * Returns OpenAI-format tool definitions + a dispatch function.
 *
 * @param {Array<{spec: object, handler: Function}>} actions
 * @returns {{ tools: Array, dispatch: Function }}
 */
export function buildActionHub(actions) {
  const tools = actions.map((a) => a.spec);
  const handlerMap = {};
  for (const a of actions) {
    handlerMap[a.spec.function.name] = a.handler;
  }

  /**
   * Execute an action by name.
   * @param {string} name
   * @param {object} params
   * @returns {Promise<{ outcome: string, failed: boolean }>}
   */
  async function dispatch(name, params) {
    const fn = handlerMap[name];
    if (!fn) {
      return { outcome: `Unknown action: ${name}`, failed: true };
    }
    try {
      const result = await fn(params);
      return { outcome: String(result), failed: false };
    } catch (err) {
      return { outcome: `Action error (${name}): ${err.message}`, failed: true };
    }
  }

  return { tools, dispatch };
}
