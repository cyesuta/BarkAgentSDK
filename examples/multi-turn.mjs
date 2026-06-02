import { BarkClient } from '../index.mjs';

const client = new BarkClient({
  provider: process.env.BARK_PROVIDER || 'deepseek',
  model: process.env.BARK_MODEL || 'deepseek-chat',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const session = client.session({ cwd: process.cwd() });
await session.send('Remember this word: bark.', { onText: (text) => process.stdout.write(text) });
await session.send('What word did I ask you to remember?', { onText: (text) => process.stdout.write(text) });