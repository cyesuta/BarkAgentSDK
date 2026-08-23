import { TurnSummary } from '../protocol/packets.mjs';

function anthropicMessages(messages) {
  const system = messages.filter((m) => m.role === 'system').map((m) => String(m.content || '')).filter(Boolean).join('\n\n');
  const result = [];
  for (const message of messages) {
    if (!message || message.role === 'system') continue;
    if (message.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: message.tool_call_id, content: String(message.content || '') };
      const previous = result.at(-1);
      if (previous?.role === 'user' && Array.isArray(previous.content) && previous.content.every((item) => item.type === 'tool_result')) previous.content.push(block);
      else result.push({ role: 'user', content: [block] });
      continue;
    }
    if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
      const content = [];
      if (message.content) content.push({ type: 'text', text: String(message.content) });
      for (const call of message.tool_calls) {
        let input = {};
        try { input = JSON.parse(call.function?.arguments || '{}'); } catch { input = {}; }
        content.push({ type: 'tool_use', id: call.id, name: call.function?.name || '', input });
      }
      result.push({ role: 'assistant', content });
      continue;
    }
    result.push({ role: message.role, content: message.content });
  }
  return { system, messages: result };
}

function anthropicTools(tools) {
  return (tools || []).map((tool) => ({
    name: tool.function?.name || '',
    description: tool.function?.description || '',
    input_schema: tool.function?.parameters || { type: 'object', properties: {} },
  }));
}

async function parseStream(resp, onEvent, messages) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', assistantText = '', reasoning = '';
  let tokensIn = 0, tokensOut = 0, tokensCache = 0;
  const calls = new Map();
  const consume = (payload) => {
    let event;
    try { event = JSON.parse(payload); } catch { return; }
    if (event.type === 'message_start') {
      const usage = event.message?.usage || {};
      tokensCache = usage.cache_read_input_tokens || 0;
      tokensIn = (usage.input_tokens || 0) + tokensCache + (usage.cache_creation_input_tokens || 0);
    } else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
      calls.set(event.index, { id: event.content_block.id, type: 'function', function: { name: event.content_block.name, arguments: '' } });
    } else if (event.type === 'content_block_delta') {
      const delta = event.delta || {};
      if (delta.type === 'text_delta' && delta.text) { assistantText += delta.text; onEvent('text', delta.text); }
      else if (delta.type === 'thinking_delta' && delta.thinking) reasoning += delta.thinking;
      else if (delta.type === 'input_json_delta') {
        const call = calls.get(event.index);
        if (call) call.function.arguments += delta.partial_json || '';
      }
    } else if (event.type === 'message_delta') {
      tokensOut = event.usage?.output_tokens || tokensOut;
    } else if (event.type === 'error') {
      throw new Error(event.error?.message || 'Anthropic stream error');
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const raw of lines) if (raw.startsWith('data:')) consume(raw.slice(5).trim());
  }
  if (buffer.trim().startsWith('data:')) consume(buffer.trim().slice(5).trim());
  if (reasoning) onEvent('reason', reasoning);
  const toolCalls = [...calls.values()].filter((call) => call.id && call.function.name);
  if (assistantText || toolCalls.length) {
    const message = { role: 'assistant', content: assistantText || null };
    if (reasoning) message.reasoning_content = reasoning;
    if (toolCalls.length) message.tool_calls = toolCalls;
    messages.push(message);
  }
  return new TurnSummary({ ok: true, tokensIn, tokensOut, tokensCache });
}

export async function runAnthropicCompat(cfg, signal, onEvent, messages, tools = []) {
  const apiKey = cfg.apiKey || process.env.BARK_CUSTOM_API_KEY || '';
  const endpoint = cfg.endpoint || process.env.BARK_CUSTOM_BASE_URL || '';
  if (!apiKey) return new TurnSummary({ ok: false, fault: 'custom API key not set (BARK_CUSTOM_API_KEY)' });
  if (!endpoint) return new TurnSummary({ ok: false, fault: 'custom base URL is required' });
  if (!cfg.variant) return new TurnSummary({ ok: false, fault: 'custom model name is required' });
  const converted = anthropicMessages(messages);
  const body = { model: cfg.variant, max_tokens: 8192, messages: converted.messages, stream: true };
  if (converted.system) body.system = converted.system;
  if (tools.length) body.tools = anthropicTools(tools);
  body.thinking = cfg.allowThinking
    ? { type: 'enabled', budget_tokens: 4096 }
    : { type: 'disabled' };
  try {
    const resp = await fetch(endpoint, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return new TurnSummary({ ok: false, fault: `custom HTTP ${resp.status}: ${text.slice(0, 300)}` });
    }
    return await parseStream(resp, onEvent, messages);
  } catch (error) {
    if (error.name === 'AbortError') return new TurnSummary({ ok: false, fault: 'aborted' });
    return new TurnSummary({ ok: false, fault: `custom error: ${error.message}` });
  }
}
