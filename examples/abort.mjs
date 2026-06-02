import { BarkClient } from '../index.mjs';

const client = new BarkClient({
  provider: process.env.BARK_PROVIDER || 'deepseek',
  model: process.env.BARK_MODEL || 'deepseek-chat',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const session = client.session({ cwd: process.cwd() });
setTimeout(() => session.abort(), 500);
const result = await session.send('Write a long story.', { onText: (text) => process.stdout.write(text) });
console.log('\n', result);