# BarkAgentSDK — 完整實作計畫

> 從 BarkIDE 的內嵌 sidecar 模式，重構為可獨立發布的 npm programmatic library。

---

## 背景與目標

### 現狀

BarkIDE 裡的 `packages/bark-sdk/` 已經是一個功能完整的 LLM agent 引擎：
- 零外部 npm 依賴（純 Node.js native）
- 多 provider 支援（DeepSeek、Kimi、Qwen、GLM、Grok、Doubao、Gemini、Codex、Ollama、OpenRouter、MiniMax）
- 內建工具系統（actionCycle、Read/Write/Edit/Bash/Glob/Grep）
- Skill 注入、Vision Proxy、Token 計費

**問題**：目前的 API 界面是 **stdin/stdout JSON frame 協定**，為 BarkIDE Tauri sidecar 架構特化，其他程式無法直接 import 使用。

### 目標

發布 `@cyesuta/bark-agent-sdk`，讓任何 Node.js / Electron / Tauri / CLI 程式都能：

```js
import { BarkClient } from '@cyesuta/bark-agent-sdk';

const client = new BarkClient({ provider: 'deepseek', apiKey: '...' });
const session = client.session({ cwd: '/my/project' });
await session.send('幫我重構這個 function', {
    onText: (t) => process.stdout.write(t),
});
```

---

## 現有架構解析

### 目前資料流

```
BarkIDE (Rust/Tauri)
  │
  ├─ sidecar::ensure()          → spawn Node.js child process (bark.mjs)
  ├─ sidecar::write_frame(f)    → stdin JSON line → Node.js
  └─ emit("claude-event", e)    ← stdout JSON line ← Node.js
         │
         └─ bark.mjs            主 message loop (readline over stdin)
               ├─ core/config.mjs      BarkConfig (immutable config bag)
               ├─ core/vault.mjs       WorkspaceVault (per-session state)
               ├─ providers/           LLM backend runners
               ├─ tools/cycle.mjs      actionCycle (agentic loop, max 25 rounds)
               ├─ tools/builtins.mjs   Read/Write/Edit/Bash/Glob/Grep/web_search
               ├─ tools/scanner.mjs    .barkide/tools/ 本地工具掃描
               ├─ skills/scanner.mjs   SKILL.md 能力注入
               └─ pricing/             Token 計費
```

### Frame 協定（現有，需內化為實作細節）

**Rust → Node.js（stdin）**
```json
{ "type": "send", "workspaceId": "ws1", "message": "...", "provider": "deepseek",
  "model": "deepseek-chat", "apiKey": "sk-...", "cwd": "/path", ... }
{ "type": "abort", "workspaceId": "ws1" }
{ "type": "reset", "workspaceId": "ws1" }
```

**Node.js → Rust（stdout）**
```json
{ "type": "text",        "workspaceId": "ws1", "text": "..." }
{ "type": "thinking",    "workspaceId": "ws1", "text": "..." }
{ "type": "tool_use",    "workspaceId": "ws1", "id": "call_1", "name": "Read", "input": {...} }
{ "type": "tool_result", "workspaceId": "ws1", "id": "call_1", "output": "...", "is_error": false }
{ "type": "done",        "workspaceId": "ws1", "success": true, "duration_ms": 2300,
                          "input_tokens": 1200, "output_tokens": 340, "cost": 0.00042 }
{ "type": "error",       "workspaceId": "ws1", "message": "..." }
```

這些 frame 會被**完全內化**，外部 API 改用 callback / EventEmitter。

---

## 目標 API 設計

### 安裝

```bash
npm install @cyesuta/bark-agent-sdk
```

### 基本使用

```js
import { BarkClient } from '@cyesuta/bark-agent-sdk';

// 建立 client（全域設定）
const client = new BarkClient({
    provider: 'deepseek',
    model: 'deepseek-chat',
    apiKey: process.env.DEEPSEEK_API_KEY,
    // 可選：
    baseUrl: 'https://api.deepseek.com',
    thinking: false,
});

// 建立 session（多輪對話）
const session = client.session({
    cwd: '/my/project',
    systemPrompt: 'You are a helpful coding assistant.',
    // 可選：
    sessionId: 'resume-id',    // 跨重啟恢復
});

// 送出訊息
const result = await session.send('幫我寫一個 fizzbuzz', {
    onText:      (text)  => process.stdout.write(text),
    onThinking:  (text)  => process.stderr.write(`[think] ${text}\n`),
    onToolUse:   (tool)  => console.log(`→ ${tool.name}`, tool.input),
    onToolResult:(res)   => console.log(`← ${res.name}`, res.output.slice(0, 80)),
    onDone:      (stats) => console.log(`\n[done] ${stats.durationMs}ms / $${stats.cost.toFixed(5)}`),
});

// result: { ok, tokensIn, tokensOut, cost, durationMs, sessionId }
```

### 多輪對話

```js
const session = client.session({ cwd: '/my/project' });

await session.send('這個 function 做什麼？');
await session.send('幫我加 unit test。');
await session.send('現在重構成 async。');

// 清除對話記憶、開新輪
await session.reset();
```

### 自訂工具

```js
client.registerTool({
    name: 'get_stock_price',
    description: '取得股票即時報價',
    inputSchema: {
        type: 'object',
        properties: {
            symbol: { type: 'string', description: '股票代號，例如 AAPL' },
        },
        required: ['symbol'],
    },
    handler: async ({ symbol }) => {
        const price = await fetchPrice(symbol);
        return `${symbol}: $${price}`;
    },
});
```

### 停用內建工具 / 部分啟用

```js
const client = new BarkClient({
    provider: 'deepseek',
    apiKey: '...',
    builtinTools: ['Read', 'Glob', 'Grep'],  // 只開讀取類，不給寫入/執行
    // builtinTools: false  → 完全停用
    // builtinTools: true   → 全部啟用（預設）
});
```

### 事件監聽（全域，跨所有 session）

```js
client.on('text',        ({ sessionId, text })   => ...);
client.on('tool_use',    ({ sessionId, tool })   => ...);
client.on('done',        ({ sessionId, stats })  => ...);
client.on('error',       ({ sessionId, error })  => ...);
```

### 中止

```js
// 中止特定 session
session.abort();

// 中止所有 session
client.abortAll();
```

### 一次性送出（無 session 狀態）

```js
const result = await BarkClient.oneShot({
    provider: 'gemini',
    apiKey: process.env.GEMINI_API_KEY,
    message: '台北明天天氣如何？',
    onText: (t) => process.stdout.write(t),
});
```

---

## 目錄結構（目標）

```
BarkAgentSDK/
├── package.json
├── index.mjs                  ← 主要 export（BarkClient、defineAction、helpers）
├── index.cjs                  ← CommonJS wrapper（給舊版 Node / bundler）
│
├── client/
│   ├── BarkClient.mjs         ← 核心 class（NEW）
│   ├── Session.mjs            ← Session class（NEW）
│   └── events.mjs             ← EventEmitter wrapper（NEW）
│
├── core/
│   ├── config.mjs             ← BarkConfig（搬移自 BarkIDE，去除 Tauri refs）
│   └── vault.mjs              ← WorkspaceVault（搬移，去除 sidecar 假設）
│
├── providers/
│   ├── registry.mjs           ← 搬移
│   ├── deepseek.mjs           ← 搬移
│   ├── openai-compat.mjs      ← 搬移
│   ├── gemini.mjs             ← 搬移
│   └── codex.mjs              ← 搬移（codex binary 仍為外部依賴）
│
├── tools/
│   ├── action.mjs             ← defineAction / buildActionHub（搬移）
│   ├── cycle.mjs              ← actionCycle（搬移）
│   ├── builtins.mjs           ← Read/Write/Edit/Bash/Glob/Grep（搬移，路徑參數化）
│   ├── scanner.mjs            ← .barkide/tools 掃描（搬移，路徑可設定）
│   └── vision.mjs             ← describe_image proxy（搬移）
│
├── skills/
│   ├── scanner.mjs            ← SKILL.md 掃描（搬移，路徑可設定）
│   └── trigger.mjs            ← TriggerRule/TriggerBoard（搬移）
│
├── pricing/
│   ├── table.mjs              ← 搬移
│   └── tracker.mjs            ← 搬移
│
└── docs/
    ├── IMPLEMENTATION_PLAN.md ← 本文件
    └── API_REFERENCE.md       ← Phase 7 完成後補充
```

---

## 實作計畫

### Phase 1 — Repository 初始化
**預計時間：0.5 天**

#### Todos

- [x] 建立 `BarkAgentSDK/package.json`
  ```json
  {
    "name": "@cyesuta/bark-agent-sdk",
    "version": "0.1.0",
    "type": "module",
    "exports": {
      ".": {
        "import": "./index.mjs",
        "require": "./index.cjs"
      }
    },
    "engines": { "node": ">=18.0.0" },
    "license": "MIT"
  }
  ```
- [x] 建立 `.github/workflows/publish.yml`（push tag → npm publish to GitHub Packages）
- [x] 建立 `.npmrc`（指向 GitHub Packages registry）
  ```
  @cyesuta:registry=https://npm.pkg.github.com
  ```
- [x] 建立 `index.mjs` 空 re-export 骨架
- [x] 建立 `index.cjs`（`module.exports = require('./index.mjs')` wrapper）
- [x] 建立 `README.md`（安裝 + 快速開始範例）
- [x] 初始化 git，設定 remote 到 GitHub
- [x] 在 GitHub 建立 public repo（`BarkAgentSDK`）

---

### Phase 2 — Core 層搬移
**預計時間：0.5 天**

從 BarkIDE `packages/bark-sdk/core/` 搬移，去除 sidecar 假設。

#### Todos

**`core/config.mjs`**
- [x] 複製 `BarkConfig` class（`config.mjs`）
- [x] 確認沒有 Tauri / sidecar 引用（目前應該是乾淨的）
- [x] 加上 JSDoc 每個欄位含義

**`core/vault.mjs`**
- [x] 複製 `WorkspaceVault` class 和 `obtainVault` / `dropVault` helpers
- [x] 去除任何 `process.stdin` / `process.stdout` 引用
- [x] 確認 vault 只管狀態，不做 I/O

**`pricing/`**
- [x] 複製 `pricing/table.mjs`（含 `pricingTable`、`computeCharge`、`exchangeRate`）
- [x] 複製 `pricing/tracker.mjs`（`usageTracker`）
- [x] 確認無外部依賴

**驗證**
- [x] `node --check core/config.mjs` ✅
- [x] `node --check core/vault.mjs` ✅
- [x] `node --check pricing/table.mjs` ✅

---

### Phase 3 — Providers 搬移
**預計時間：0.5 天**

#### Todos

**`providers/registry.mjs`**
- [x] 複製 registry（`registerProvider`、`resolveProvider`、`PROVIDER_ENV_MAP`）
- [x] 去除任何 BarkIDE 特定 import

**`providers/deepseek.mjs`**
- [x] 複製（含 `<think>` tag 解析 state machine）
- [x] 確認 `parseOpenAIStream` helper 也一起搬

**`providers/openai-compat.mjs`**
- [x] 複製（涵蓋 Kimi、Qwen、GLM、Grok、Doubao、Mimo、OpenRouter、MiniMax、Ollama）

**`providers/gemini.mjs`**
- [x] 複製（含 Gemini content format 轉換、vision 支援）

**`providers/codex.mjs`**
- [x] 複製
- [x] 文件標注：需要外部 `codex` binary，其他 provider 無此要求

**驗證**
- [x] `node --check providers/registry.mjs` ✅
- [x] `node --check providers/deepseek.mjs` ✅
- [x] `node --check providers/openai-compat.mjs` ✅
- [x] `node --check providers/gemini.mjs` ✅

---

### Phase 4 — Tools & Action Cycle 搬移
**預計時間：1 天**

#### Todos

**`tools/action.mjs`**
- [x] 複製 `defineAction`、`buildActionHub`
- [x] 確認介面文件完整

**`tools/cycle.mjs`**
- [x] 複製 `actionCycle`（max 25 rounds logic）
- [x] 確認 `AbortSignal` 中止路徑完整

**`tools/builtins.mjs`**
- [x] 複製 Read / Glob / Grep / Write / Edit / MultiEdit / Bash / web_search / fetch_url
- [x] **重要改動**：`registerBuiltinActions(workspace, options = {})` 的 `workspace` 保持必填
- [x] 加 `options.allowed` 陣列支援（讓 caller 選擇只開放哪些工具）
  ```js
  registerBuiltinActions('/my/project', { allowed: ['Read', 'Glob', 'Grep'] })
  ```
- [x] Write / Edit / MultiEdit / Bash 的 workspace 限制邏輯保留（安全邊界）

**`tools/scanner.mjs`**
- [x] 複製 `scanLocalActions`、`scanDispatcherTasks`
- [x] **改動**：工具目錄路徑從 `<cwd>/.barkide/tools/` 改為可設定
  ```js
  scanLocalActions(cwd, { toolsDir: '.barkide/tools' })   // 預設值維持兼容
  ```

**`tools/vision.mjs`**
- [x] 複製 `hasNativeVision`、`outlinePicture`、`directPicturePass`、`pictureNote`

**驗證**
- [x] `node --check tools/action.mjs` ✅
- [x] `node --check tools/cycle.mjs` ✅
- [x] `node --check tools/builtins.mjs` ✅
- [x] `node --check tools/scanner.mjs` ✅

---

### Phase 5 — Skills 搬移
**預計時間：0.5 天**

#### Todos

**`skills/scanner.mjs`**
- [x] 複製 `capabilityScanner`、`injectCapabilities`
- [x] **改動**：skill 搜尋目錄從硬碼改為可設定
  ```js
  // 預設搜尋順序（維持兼容）：
  const DEFAULT_SKILL_DIRS = ['.barkide/skills', '.agents/skills', '.claude/skills', 'skills'];

  capabilityScanner(cwd, { skillDirs: DEFAULT_SKILL_DIRS })
  ```

**`skills/trigger.mjs`**
- [x] 複製 `TriggerRule`、`TriggerBoard`
- [x] 無 BarkIDE 特定依賴，應為直接搬移

**驗證**
- [x] `node --check skills/scanner.mjs` ✅
- [x] `node --check skills/trigger.mjs` ✅

---

### Phase 6 — BarkClient & Session class（核心新增）
**預計時間：2 天**

這是最重要的 phase，把所有搬移來的模組組裝成乾淨的 programmatic API。

#### Todos

**`client/events.mjs`**
- [x] 實作輕量 EventEmitter（或直接用 Node.js `EventEmitter`）
- [x] 事件列表：`text`、`thinking`、`tool_use`、`tool_result`、`done`、`error`

**`client/Session.mjs`**
- [x] 實作 `Session` class
  ```
  屬性：
    id          string          唯一 session id（預設 uuid v4）
    cwd         string          工作目錄
    vault       WorkspaceVault  對話狀態
    config      BarkConfig      本 session 的設定
    _abortCtrl  AbortController 中止控制
    _client     BarkClient      back reference
  
  方法：
    send(message, callbacks?)   → Promise<TurnResult>
    abort()                     → void
    reset()                     → Promise<void>
    getHistory()                → Array   (只讀副本)
    getId()                     → string
  ```
- [x] `send()` 內部流程：
  1. 取得 `vault`（`obtainVault(id)`）
  2. 組裝 `BarkConfig`（merge client config + session config）
  3. 掃描並注入 skills（`capabilityScanner`）
  4. 掃描並注入本地工具（`scanLocalActions`）
  5. 建立 `actionHub`（`buildActionHub([...builtins, ...customTools])`）
  6. Vision proxy 處理（如有 images）
  7. Date marker 注入
  8. 呼叫 `actionCycle(runner, cfg, signal, onEvent, messages, actionHub)`
  9. 更新 `vault.messages = stripSystemMessages(messages)`
  10. 計費：`computeCharge(...)` → 填入 `TurnResult`
  11. 觸發 client 全域事件
- [x] `reset()` 流程：
  1. `session.abort()`
  2. `dropVault(id)` → 清空對話記憶
  3. 觸發 `client.emit('reset', { sessionId })`

**`client/BarkClient.mjs`**
- [x] 實作 `BarkClient` class
  ```
  constructor(config)
    - config.provider     string    必填
    - config.apiKey       string    必填（除 codex）
    - config.model        string    可選（使用 provider 預設）
    - config.baseUrl      string    可選
    - config.thinking     boolean   可選（預設 false）
    - config.builtinTools true|false|string[]  可選（預設 true）
    - config.systemPrompt string    可選（全域 system prompt）

  session(options?)       → Session
    - options.cwd         string
    - options.systemPrompt string   覆蓋全域 system prompt
    - options.sessionId   string    指定 id 用於恢復

  registerTool(spec)      → this    加入自訂工具（全域）
  removeTool(name)        → this
  listTools()             → string[]

  on(event, handler)      → this
  off(event, handler)     → this
  emit(event, data)       → void

  abortAll()              → void
  destroy()               → void   清除所有 session vault

  static oneShot(options) → Promise<TurnResult>
  ```
- [x] `registerTool` 驗證 spec 有 `name`、`description`、`inputSchema`、`handler`
- [x] `builtinTools` 處理：
  - `true` → `registerBuiltinActions(cwd)` 全部
  - `false` → 不加
  - `string[]` → `registerBuiltinActions(cwd, { allowed: [...] })`
- [x] API key 環境變數自動設定（維持現有 `apiKeyEnv` 邏輯）

**`index.mjs`**
- [x] Re-export：
  ```js
  export { BarkClient } from './client/BarkClient.mjs';
  export { defineAction } from './tools/action.mjs';
  export { BUILTIN_TOOL_NAMES } from './tools/builtins.mjs';
  export { pricingTable } from './pricing/table.mjs';
  // providers（給進階用戶）
  export { registerProvider, resolveProvider, listProviders } from './providers/registry.mjs';
  ```

**驗證**
- [x] `node --check client/events.mjs` ✅
- [x] `node --check client/Session.mjs` ✅
- [x] `node --check client/BarkClient.mjs` ✅
- [x] `node --check index.mjs` ✅

---

### Phase 7 — 端對端測試
**預計時間：1 天**

#### Todos

**手動冒煙測試**（建立 `examples/` 目錄）

- [x] `examples/basic.mjs`：基本 send + onText streaming
  ```js
  import { BarkClient } from '../index.mjs';
  const c = new BarkClient({ provider: 'deepseek', apiKey: '...' });
  const s = c.session({ cwd: process.cwd() });
  await s.send('寫 hello world', { onText: t => process.stdout.write(t) });
  ```
- [x] `examples/multi-turn.mjs`：多輪對話，驗證 vault 累積正確
- [x] `examples/custom-tool.mjs`：自訂工具被模型呼叫
- [x] `examples/file-tools.mjs`：Read / Grep / Glob 對真實檔案
- [x] `examples/vision.mjs`：含圖片的 send（non-native provider → describe_image）
- [x] `examples/abort.mjs`：mid-stream abort，確認 TurnResult.ok = false

**單元測試**（可選，工作量較大）
- [x] `tests/config.test.mjs`：BarkConfig immutability
- [x] `tests/vault.test.mjs`：obtainVault / dropVault lifecycle
- [x] `tests/pricing.test.mjs`：已知 token 數 → 已知 cost
- [x] `tests/action.test.mjs`：defineAction + dispatch happy path + error path
- [x] `tests/session-e2e.test.mjs`：mock provider 端對端測試，覆蓋 Session.send callbacks / events / tool loop / reset

---

### Phase 8 — BarkIDE 整合（用 SDK 取代內嵌 bark.mjs）
**預計時間：1 天**

目標：BarkIDE 自己成為第一個使用者，從 npm 安裝 SDK。

#### Todos

- [x] BarkIDE `packages/bark-sdk/` 整個改為：
  ```
  packages/bark-sdk/
  ├── package.json          → "dependencies": { "@cyesuta/bark-agent-sdk": "^0.1.0" }
  └── sidecar.mjs           → 薄包裝，維持 stdin/stdout frame 協定
  ```
- [x] `sidecar.mjs` 只做一件事：讀取 stdin frames → 呼叫 SDK → 把 SDK callbacks 轉寫回 stdout frames
  - 這樣 Rust 端的 `sidecar.rs` **完全不需要改動**
  - 現有的 `build_send_frame`、`write_frame`、事件 emit 邏輯全部保留
- [x] `sidecar.mjs` 的 `onText` callback → `console.log(JSON.stringify({type:'text',...}))`
- [ ] 驗證 BarkIDE 啟動、對話、多輪、reset 全部正常
- [x] `npm run bundle:sidecars` ✅
- [x] `cargo check` ✅

---

### Phase 9 — npm 發布設定
**預計時間：0.5 天**

#### Todos

- [x] 建立 `.github/workflows/publish.yml`：
  ```yaml
  on:
    push:
      tags: ['v*']
  jobs:
    publish:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: '20'
            registry-url: 'https://npm.pkg.github.com'
        - run: npm publish
          env:
            NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  ```
- [x] 在 `package.json` 加 `"publishConfig": { "registry": "https://npm.pkg.github.com" }`
- [ ] 測試 tag `v0.1.0`，確認 GitHub Packages 出現 `@cyesuta/bark-agent-sdk@0.1.0`
- [ ] 在另一個測試專案安裝並驗證 `npm install @cyesuta/bark-agent-sdk`

---

## 其他程式如何呼叫

### 情境 A：CLI 腳本

```js
#!/usr/bin/env node
// ask.mjs
import { BarkClient } from '@cyesuta/bark-agent-sdk';

const client = new BarkClient({
    provider: 'deepseek',
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: 'deepseek-chat',
    builtinTools: ['Read', 'Glob', 'Grep'],
});

const session = client.session({ cwd: process.argv[2] || process.cwd() });
const question = process.argv.slice(3).join(' ');

await session.send(question, {
    onText:     (t) => process.stdout.write(t),
    onToolUse:  (t) => process.stderr.write(`\n[→ ${t.name}]\n`),
    onDone:     (s) => process.stderr.write(`\n[done ${s.durationMs}ms]\n`),
});
```

```bash
node ask.mjs /my/project "解釋 src/main.js 做什麼"
```

### 情境 B：Electron app

```js
// main/agent.js
import { BarkClient } from '@cyesuta/bark-agent-sdk';
import { ipcMain } from 'electron';

const client = new BarkClient({
    provider: 'deepseek',
    apiKey: store.get('deepseek_api_key'),
});

ipcMain.handle('agent:send', async (event, { sessionId, message, cwd }) => {
    const session = client.session({ cwd, sessionId });
    return await session.send(message, {
        onText: (t) => event.sender.send('agent:text', t),
        onDone: (s) => event.sender.send('agent:done', s),
    });
});

ipcMain.handle('agent:abort', (event, { sessionId }) => {
    client.getSession(sessionId)?.abort();
});
```

### 情境 C：Express API server

```js
import express from 'express';
import { BarkClient } from '@cyesuta/bark-agent-sdk';

const app = express();
const client = new BarkClient({ provider: 'gemini', apiKey: process.env.GEMINI_API_KEY });

app.post('/chat', async (req, res) => {
    const { sessionId, message, cwd } = req.body;
    res.setHeader('Content-Type', 'text/event-stream');

    const session = client.session({ cwd, sessionId });
    await session.send(message, {
        onText:  (t) => res.write(`data: ${JSON.stringify({ type: 'text', text: t })}\n\n`),
        onDone:  (s) => res.write(`data: ${JSON.stringify({ type: 'done', ...s })}\n\n`),
    });
    res.end();
});
```

### 情境 D：另一個 Tauri app（和 BarkIDE 相同架構）

```rust
// src-tauri/src/agent/my_agent/mod.rs
// 和 BarkIDE 完全一樣的模式——薄 Rust sidecar wrapper
// 用 sidecar::write_frame(build_send_frame(...)) 即可
// Node.js 端 sidecar.mjs import SDK 來處理
```

---

## 時間表總覽

| Phase | 內容 | 預計天數 |
|-------|------|---------|
| 1 | Repository 初始化 | 0.5 |
| 2 | Core 層搬移 | 0.5 |
| 3 | Providers 搬移 | 0.5 |
| 4 | Tools & Action Cycle 搬移 | 1.0 |
| 5 | Skills 搬移 | 0.5 |
| 6 | BarkClient & Session（核心新增）| 2.0 |
| 7 | 端對端測試 | 1.0 |
| 8 | BarkIDE 整合 | 1.0 |
| 9 | npm 發布設定 | 0.5 |
| **合計** | | **~7.5 天** |

---

## 風險與注意事項

### ⚠️ Codex Provider

`providers/codex.mjs` 透過 `child_process.spawn` 啟動外部 `codex` binary（JSON-RPC over stdio）。
這個 provider 在獨立 SDK 中仍然可用，但使用者需要自行安裝 codex binary。
建議在文件標注此差異。

### ⚠️ Vision Proxy 需要 GEMINI_API_KEY

非 native-vision provider 的 `describe_image` 工具會呼叫 Gemini 2.5 Flash。
使用者需要自行提供 `GEMINI_API_KEY` 或設定 `config.geminiApiKey`。

### ⚠️ BarkIDE 升級路徑（Phase 8）

Phase 8 的 `sidecar.mjs` 薄包裝是設計的核心：**Rust 端完全不改動**。
這確保了 BarkIDE 現有的所有功能（歷史記錄、Telegram 橋接、中止、重置）都能繼續正常運作。
如果薄包裝實作不正確，可能導致 BarkIDE 的 Bark 模式失效，需要謹慎測試。

### ⚠️ Phase 6 的 Session.send() 要複製 bark.mjs 的隱含邏輯

`bark.mjs` 裡有幾個 BarkIDE 特定行為需要仔細移植：
1. **Date marker 注入**（第一次訊息 / 日期跨日）
2. **系統 prompt + skills 每輪重建後從 messages 剝除**（`stripSystemMessages`）
3. **Provider 切換偵測**（vault.channel 比對）→ 在 SDK 裡 Session 切換 provider 時要 reset motor

---

*文件版本：1.0 — 2026-06-02*

---

## 目前狀態更新（2026-06-03）

上述 checkbox 已依 repo 現況更新：SDK 本體、examples、unit tests、BarkIDE adapter、publish workflow 與 `publishConfig` 已完成並通過本地 `npm run check` / `npm test`（含 mock provider E2E）；BarkIDE `npm run bundle:sidecars` / `cargo check` 也已通過。保留未勾選項目代表仍需實際 build/runtime 或外部發布安裝驗證。

### 發布驗證阻塞

- 2026-06-03 執行 `npm view @cyesuta/bark-agent-sdk versions --registry=https://npm.pkg.github.com`，結果為 `E401 Unauthorized`。目前環境沒有可用的 GitHub Packages token，因此 GitHub Packages 套件存在性與 registry 乾淨安裝驗證仍保留未完成。
- `npm pack --dry-run` 已通過，prepack 會執行 `npm run check && npm test`，本地封包內容驗證正常。
