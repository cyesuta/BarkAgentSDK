# API Reference

## `BarkClient`

```js
import { BarkClient } from '@cyesuta/bark-agent-sdk';
```

### `new BarkClient(config)`

Common config fields:

- `provider`: Provider alias such as `deepseek`, `kimi`, `qwen`, `glm`, `grok`, `doubao`, `gemini`, `openrouter`, `minimax`, `ollama`, or `codex`.
- `model`: Provider model name.
- `apiKey`: Runtime API key override.
- `apiKeyEnv`: Environment variable name to set from `apiKey`.
- `baseUrl` / `endpoint`: Provider endpoint override.
- `baseUrlEnv` / `endpointEnv`: Environment variable name to set from `baseUrl`.
- `thinking`: Enables provider reasoning output when supported.
- `builtinTools`: `true`, `false`, or a list such as `['Read', 'Glob', 'Grep']`.
- `toolsDir`: Project-local tool directory. Default: `.barkide/tools`.
- `skillDirs`: Skill search directories. Default: `.barkide/skills`, `.agents/skills`, `.claude/skills`, `skills`.
- `systemPrompt`: Global system prompt.

### `client.session(options)`

Creates a multi-turn `Session`. `options.sessionId` resumes the same vault id.

### `client.registerTool(spec)`

Registers a custom tool globally for future turns.

```js
client.registerTool({
  name: 'echo',
  description: 'Echo text',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
  },
  handler: async ({ text }) => text,
});
```

### Events

`client.on(event, handler)` supports `text`, `thinking`, `tool_use`, `tool_result`, `done`, `error`, and `reset`.

## `Session`

### `session.send(message, callbacks)`

Runs one turn. Callback names:

- `onText(text)`
- `onThinking(text)`
- `onToolUse(tool)`
- `onToolResult(result)`
- `onError(error)`
- `onDone(stats)`

Returns a turn result with `ok`, `success`, `aborted`, `fault`, token counts, `cost`, `durationMs`, and `sessionId`.

### `session.abort()`

Aborts the current turn.

### `session.reset()`

Drops the session vault and emits `reset`.

### `session.getHistory()`

Returns a cloned copy of the conversation history.

## Helpers

- `defineAction(name, description, inputSchema, handler)`
- `buildActionHub(actions)`
- `registerBuiltinActions(workspace, { allowed })`
- `BUILTIN_TOOL_NAMES`
- `pricingTable`, `computeCharge`
- `registerProvider`, `resolveProvider`, `listProviders`, `hasProvider`