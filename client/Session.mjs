import { randomUUID } from 'node:crypto';
import { BarkConfig } from '../core/config.mjs';
import { obtainVault, dropVault } from '../core/vault.mjs';
import { actionCycle } from '../tools/cycle.mjs';
import { registerBuiltinActions } from '../tools/builtins.mjs';
import { scanLocalActions, scanDispatcherTasks } from '../tools/scanner.mjs';
import { buildActionHub } from '../tools/action.mjs';
import { hasNativeVision, directPicturePass, outlinePicture, pictureNote } from '../tools/vision.mjs';
import { capabilityScanner, injectCapabilities } from '../skills/scanner.mjs';
import { computeCharge } from '../pricing/table.mjs';
import { resolveProvider } from '../providers/registry.mjs';
import { ensureDefaultProviders } from './providers.mjs';

function normalizeProvider(provider) {
  return String(provider || 'deepseek').trim().toLowerCase() || 'deepseek';
}

function normalizeBaseUrl(provider, baseUrl) {
  let resolved = String(baseUrl || '');
  if (resolved && provider !== 'gemini' && !resolved.includes('/chat/completions')) {
    resolved = resolved.replace(/\/+$/, '') + '/chat/completions';
  }
  return resolved;
}

function timeMarker(vault, isNewMotor) {
  const d = new Date();
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const formatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} (${weekdays[d.getDay()]})`;
  const dayChanged = vault.dayAnchor !== null && vault.dayAnchor !== formatted;

  if (!(isNewMotor || dayChanged)) {
    vault.dayAnchor = formatted;
    return '';
  }

  vault.dayAnchor = formatted;
  return dayChanged
    ? `[The date has changed. Today's date is now ${formatted}. Use this as today's date.]\n\n`
    : `[Current date: ${formatted}. Use this as today's date; do not rely on your training cutoff.]\n\n`;
}

function buildSystemMessages(systemPrompt, cwd, options = {}) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });

  const skills = capabilityScanner(cwd, { skillDirs: options.skillDirs });
  const skillPrompt = skills.length > 0 ? injectCapabilities(skills) : '';
  if (skillPrompt) {
    const existing = messages.find((m) => m.role === 'system');
    if (existing) existing.content += '\n\n' + skillPrompt;
    else messages.push({ role: 'system', content: skillPrompt });
  }

  return { messages, skills };
}

function buildUserMessage(text, pictures, provider) {
  const hasImages = Object.keys(pictures).length > 0;
  if (hasImages && hasNativeVision(provider)) {
    return { role: 'user', content: directPicturePass(text, pictures) };
  }

  let userText = text;
  if (hasImages) userText += pictureNote(pictures);
  return { role: 'user', content: userText };
}

function stripSystemMessages(messages) {
  return messages.filter((m) => m && m.role !== 'system');
}

function toPictures(images) {
  const pictures = {};
  for (const img of Array.isArray(images) ? images : []) {
    const ref = img?.ref || img?.reference;
    if (!ref) continue;
    pictures[ref] = {
      mediaType: img.mediaType || img.media_type || 'image/png',
      content: img.data || img.content || '',
    };
  }
  return pictures;
}

function builtinActions(cwd, builtinTools) {
  if (builtinTools === false) return [];
  return registerBuiltinActions(cwd, {
    allowed: Array.isArray(builtinTools) ? builtinTools : undefined,
  });
}

export class Session {
  constructor(client, options = {}) {
    ensureDefaultProviders();
    this._client = client;
    this.id = options.sessionId || options.id || randomUUID();
    this.cwd = options.cwd || process.cwd();
    this.config = { ...options };
    this.vault = obtainVault(this.id);
    this._abortCtrl = null;
  }

  getId() {
    return this.id;
  }

  getHistory() {
    return this.vault.messages.map((m) => structuredClone(m));
  }

  abort() {
    if (this._abortCtrl) this._abortCtrl.abort();
    if (this.vault.motor?.halt) {
      try { this.vault.motor.halt(); } catch { /* ignore */ }
    }
  }

  async reset() {
    this.abort();
    dropVault(this.id);
    this.vault = obtainVault(this.id);
    this._client.emit('reset', { sessionId: this.id });
  }

  async send(message, callbacks = {}) {
    const merged = { ...this._client.config, ...this.config, ...callbacks };
    const provider = normalizeProvider(merged.provider);
    const baseUrl = normalizeBaseUrl(provider, merged.baseUrl || merged.endpoint || '');
    const model = merged.model || '';
    const systemPrompt = merged.systemPrompt || merged.guidance || '';
    const cwd = merged.cwd || this.cwd || process.cwd();
    const allowThinking = merged.thinking === true || process.env.BARK_THINKING === '1';
    const start = Date.now();

    process.env.BARK_PROVIDER = provider;
    if (merged.apiKey && merged.apiKeyEnv) process.env[merged.apiKeyEnv] = merged.apiKey;
    if (baseUrl && (merged.baseUrlEnv || merged.endpointEnv)) process.env[merged.baseUrlEnv || merged.endpointEnv] = baseUrl;
    if (merged.geminiApiKey) process.env.GEMINI_API_KEY = merged.geminiApiKey;

    this.vault.silenced = false;
    this.vault.faulted = false;
    this.vault.variant = model;
    this.vault.pictures = toPictures(merged.images);

    const providerChanged = this.vault.channel !== null && this.vault.channel !== provider;
    const endpointChanged = this.vault.endpoint !== null && this.vault.endpoint !== baseUrl;
    const workspaceChanged = this.vault.workspace !== null && this.vault.workspace !== cwd;
    if (providerChanged || endpointChanged || workspaceChanged) {
      if (this.vault.motor) {
        try { await this.vault.motor.scrap(); } catch { /* ignore */ }
      }
      this.vault.motor = null;
      this.vault.channel = null;
      this.vault.endpoint = null;
      this.vault.workspace = null;
    }

    const isNewMotor = this.vault.motor === null && this.vault.messages.length === 0;
    const fullMessage = timeMarker(this.vault, isNewMotor) + String(message || '').trim();
    const { messages: systemMessages, skills } = buildSystemMessages(systemPrompt, cwd, {
      skillDirs: merged.skillDirs,
    });
    const msgs = [...systemMessages, ...this.vault.messages];
    msgs.push(buildUserMessage(fullMessage, this.vault.pictures, provider));

    let projectActions = [];
    try { projectActions = await scanLocalActions(cwd, { toolsDir: merged.toolsDir }); } catch { /* local tools are optional */ }
    try { projectActions.push(...await scanDispatcherTasks(cwd)); } catch { /* dispatcher tasks are optional */ }
    if (Object.keys(this.vault.pictures).length > 0 && !hasNativeVision(provider)) {
      projectActions.push(...outlinePicture(this.vault.pictures));
    }

    const allActions = [
      ...builtinActions(cwd, merged.builtinTools ?? true),
      ...projectActions,
      ...this._client.customActions(),
    ];
    const actionHub = buildActionHub(allActions);
    const cfg = new BarkConfig({
      guidance: systemPrompt,
      workspace: cwd,
      variant: model,
      channel: provider,
      abilities: skills,
      actionHubs: actionHub,
      allowThinking,
      apiKey: merged.apiKey || '',
      apiKeyEnv: merged.apiKeyEnv || '',
      endpoint: baseUrl,
      endpointEnv: merged.baseUrlEnv || merged.endpointEnv || '',
    });

    const emit = (event, payload) => {
      this._client.emit(event, { sessionId: this.id, ...payload });
    };
    const onEvent = (type, data) => {
      if (type === 'text') {
        callbacks.onText?.(String(data));
        emit('text', { text: String(data) });
      } else if (type === 'reason') {
        callbacks.onThinking?.(String(data));
        emit('thinking', { text: String(data) });
      } else if (type === 'action') {
        const tool = { id: data?.ref || '', name: data?.label || '', input: data?.params || {} };
        callbacks.onToolUse?.(tool);
        emit('tool_use', { tool });
      } else if (type === 'outcome') {
        const result = { id: data?.ref || '', output: data?.outcome || String(data || ''), isError: !!data?.failed };
        callbacks.onToolResult?.(result);
        emit('tool_result', { result });
      }
    };

    this._abortCtrl = new AbortController();
    this.vault.running = this._abortCtrl;

    try {
      const providerRunner = resolveProvider(provider).runner;
      const turnAbortCtrl = this._abortCtrl;
      this.vault.motor = {
        cfg,
        halt: () => turnAbortCtrl?.abort(),
        scrap: async () => turnAbortCtrl?.abort(),
      };
      this.vault.channel = provider;
      this.vault.endpoint = baseUrl;
      this.vault.workspace = cwd;

      const result = allActions.length === 0
        ? await providerRunner(cfg, this._abortCtrl.signal, onEvent, msgs, [])
        : await actionCycle(providerRunner, cfg, this._abortCtrl.signal, onEvent, msgs, actionHub);
      const durationMs = Date.now() - start;
      const cost = computeCharge(provider, model, result.tokensIn, result.tokensOut, result.tokensCache) || result.charge || 0;

      if (result.ok) {
        this.vault.messages = stripSystemMessages(msgs);
      } else if (result.fault && result.fault !== 'aborted') {
        const error = new Error(result.fault);
        callbacks.onError?.(error);
        emit('error', { error });
      }

      const turn = {
        ok: result.ok,
        success: result.ok,
        aborted: !result.ok && result.fault === 'aborted',
        fault: result.fault || '',
        tokensIn: result.tokensIn || 0,
        tokensOut: result.tokensOut || 0,
        tokensCache: result.tokensCache || 0,
        cost,
        durationMs,
        sessionId: this.id,
      };
      callbacks.onDone?.(turn);
      emit('done', { stats: turn });
      return turn;
    } catch (error) {
      const turn = { ok: false, success: false, aborted: false, fault: error.message, durationMs: Date.now() - start, sessionId: this.id };
      callbacks.onError?.(error);
      emit('error', { error });
      callbacks.onDone?.(turn);
      emit('done', { stats: turn });
      return turn;
    } finally {
      this.vault.running = null;
      this._abortCtrl = null;
    }
  }
}
