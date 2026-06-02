import { EventEmitter } from 'node:events';
import { Session } from './Session.mjs';
import { defineAction } from '../tools/action.mjs';
import { vaults, dropVault } from '../core/vault.mjs';
import { ensureDefaultProviders } from './providers.mjs';

function validateTool(spec) {
  if (!spec || typeof spec !== 'object') throw new Error('Tool spec must be an object');
  if (!spec.name || typeof spec.name !== 'string') throw new Error('Tool spec requires name');
  if (!spec.description || typeof spec.description !== 'string') throw new Error('Tool spec requires description');
  if (!spec.inputSchema || typeof spec.inputSchema !== 'object') throw new Error('Tool spec requires inputSchema');
  if (typeof spec.handler !== 'function') throw new Error('Tool spec requires handler');
}

export class BarkClient {
  constructor(config = {}) {
    ensureDefaultProviders();
    this.config = { ...config };
    this._events = new EventEmitter();
    this._tools = new Map();
    this._sessions = new Map();
  }

  session(options = {}) {
    const session = new Session(this, options);
    this._sessions.set(session.id, session);
    return session;
  }

  getSession(id) {
    return this._sessions.get(id) || null;
  }

  registerTool(spec) {
    validateTool(spec);
    this._tools.set(spec.name, defineAction(spec.name, spec.description, spec.inputSchema, spec.handler));
    return this;
  }

  removeTool(name) {
    this._tools.delete(name);
    return this;
  }

  listTools() {
    return [...this._tools.keys()];
  }

  customActions() {
    return [...this._tools.values()];
  }

  on(event, handler) {
    this._events.on(event, handler);
    return this;
  }

  off(event, handler) {
    this._events.off(event, handler);
    return this;
  }

  emit(event, data) {
    this._events.emit(event, data);
  }

  abortAll() {
    for (const session of this._sessions.values()) session.abort();
  }

  destroy() {
    this.abortAll();
    for (const id of this._sessions.keys()) dropVault(id);
    this._sessions.clear();
    this._events.removeAllListeners();
  }

  static async oneShot(options = {}) {
    const { message, ...config } = options;
    const client = new BarkClient(config);
    const session = client.session({ cwd: options.cwd, systemPrompt: options.systemPrompt });
    try {
      return await session.send(message || '', options);
    } finally {
      client.destroy();
    }
  }
}

export { vaults };