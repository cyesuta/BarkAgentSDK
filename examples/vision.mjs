import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { BarkClient } from '../index.mjs';

const imagePath = process.argv[2];
if (!imagePath) throw new Error('Usage: node examples/vision.mjs <image-path>');

const image = await readFile(imagePath);
const client = new BarkClient({
  provider: process.env.BARK_PROVIDER || 'gemini',
  model: process.env.BARK_MODEL || 'gemini-2.5-flash',
  apiKey: process.env.GEMINI_API_KEY,
});

const session = client.session({ cwd: process.cwd() });
await session.send(`Describe ${basename(imagePath)}.`, {
  images: [{ ref: 'img_1', mediaType: 'image/png', data: image.toString('base64') }],
  onText: (text) => process.stdout.write(text),
});