import { BarkClient } from '../index.mjs';

const client = new BarkClient({
  provider: process.env.BARK_PROVIDER || 'deepseek',
  model: process.env.BARK_MODEL || 'deepseek-chat',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

client.registerTool({
  name: 'get_time_zone',
  description: 'Return the configured time zone.',
  inputSchema: { type: 'object', properties: {}, required: [] },
  handler: async () => Intl.DateTimeFormat().resolvedOptions().timeZone,
});

const session = client.session({ cwd: process.cwd() });
await session.send('Call get_time_zone and tell me the result.', {
  onText: (text) => process.stdout.write(text),
  onToolUse: (tool) => process.stderr.write(`\n[tool ${tool.name}]\n`),
});