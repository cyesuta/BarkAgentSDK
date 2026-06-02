import { BarkClient } from '../index.mjs';

const client = new BarkClient({
  provider: process.env.BARK_PROVIDER || 'deepseek',
  model: process.env.BARK_MODEL || 'deepseek-chat',
  apiKey: process.env.DEEPSEEK_API_KEY,
  builtinTools: ['Read', 'Glob', 'Grep'],
});

const session = client.session({ cwd: process.cwd() });
await session.send('Use file tools to list important files in this project.', {
  onText: (text) => process.stdout.write(text),
  onToolUse: (tool) => process.stderr.write(`\n[tool ${tool.name}]\n`),
});