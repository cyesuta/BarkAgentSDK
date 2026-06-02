import { BarkClient } from '../index.mjs';

const client = new BarkClient({
  provider: process.env.BARK_PROVIDER || 'deepseek',
  model: process.env.BARK_MODEL || 'deepseek-chat',
  apiKey: process.env.DEEPSEEK_API_KEY,
  builtinTools: ['Read', 'Glob', 'Grep'],
});

const session = client.session({ cwd: process.cwd() });
const result = await session.send(process.argv.slice(2).join(' ') || 'Say hello.', {
  onText: (text) => process.stdout.write(text),
  onDone: (stats) => process.stderr.write(`\n[done ${stats.durationMs}ms]\n`),
});

if (!result.ok) process.exitCode = 1;