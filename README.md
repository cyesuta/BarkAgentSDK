# BarkAgentSDK

Programmatic Bark agent SDK extracted from BarkIDE.

```js
import { BarkClient } from '@cyesuta/bark-agent-sdk';

const client = new BarkClient({
  provider: 'deepseek',
  model: 'deepseek-chat',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const session = client.session({ cwd: process.cwd() });
await session.send('Say hello', {
  onText: (text) => process.stdout.write(text),
});
```

This initial `0.1.0` release keeps BarkIDE compatibility while exposing `BarkClient`, `Session`, provider registry helpers, and action helpers.