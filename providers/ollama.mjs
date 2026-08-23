import { TurnSummary } from '../protocol/packets.mjs';

function endpointFor(value) {
  const raw = String(value || 'http://localhost:11434').replace(/\/+$/, '');
  if (/\/api\/chat$/i.test(raw)) return raw;
  return raw
    .replace(/\/v1\/chat\/completions$/i, '')
    .replace(/\/v1$/i, '') + '/api/chat';
}

function ollamaMessages(messages) {
  return (messages || []).map((message) => {
    const result = { role: message.role, content: message.content ?? '' };
    if (Array.isArray(message.tool_calls)) {
      result.tool_calls = message.tool_calls.map((call) => ({
        function: {
          name: call.function?.name || '',
          arguments: (() => {
            try { return JSON.parse(call.function?.arguments || '{}'); }
            catch { return {}; }
          })(),
        },
      }));
    }
    if (message.role === 'tool' && message.tool_call_id) result.tool_call_id = message.tool_call_id;
    return result;
  });
}

function normalizedToolCalls(toolCalls, sequence) {
  return (toolCalls || []).map((call, index) => ({
    id: call.id || `ollama_call_${sequence}_${index}`,
    type: 'function',
    function: {
      name: call.function?.name || '',
      arguments: JSON.stringify(call.function?.arguments || {}),
    },
  }));
}

export async function runOllama(cfg, signal, onEvent, messages, tools = []) {
  const endpoint = endpointFor(cfg.endpoint || process.env.OLLAMA_BASE_URL);
  const model = cfg.variant || 'gemma4:e2b';
  const body = {
    model,
    messages: ollamaMessages(messages),
    stream: true,
    // Ollama's native /api/chat uses `think` as the explicit master switch.
    // Sending false matters because thinking-capable Qwen models may default on.
    think: cfg.allowThinking,
  };
  if (tools.length) body.tools = tools;

  try {
    const headers = { 'Content-Type': 'application/json' };
    const apiKey = cfg.apiKey || process.env.OLLAMA_API_KEY || '';
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetch(endpoint, {
      method: 'POST', headers, body: JSON.stringify(body), signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return new TurnSummary({ ok: false, fault: `ollama HTTP ${response.status}: ${text.slice(0, 300)}` });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', assistantText = '', reasoning = '';
    let tokensIn = 0, tokensOut = 0, sequence = 0;
    const allToolCalls = [];
    const consume = (line) => {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.error) throw new Error(String(event.error));
      const message = event.message || {};
      if (message.thinking) reasoning += String(message.thinking);
      if (message.content) {
        assistantText += String(message.content);
        onEvent('text', String(message.content));
      }
      allToolCalls.push(...normalizedToolCalls(message.tool_calls, sequence++));
      tokensIn = event.prompt_eval_count || tokensIn;
      tokensOut = event.eval_count || tokensOut;
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) consume(line);
    }
    if (buffer.trim()) consume(buffer);
    if (reasoning) onEvent('reason', reasoning);
    if (assistantText || allToolCalls.length) {
      const assistant = { role: 'assistant', content: assistantText || null };
      if (reasoning) assistant.reasoning_content = reasoning;
      if (allToolCalls.length) assistant.tool_calls = allToolCalls;
      messages.push(assistant);
    }
    return new TurnSummary({ ok: true, tokensIn, tokensOut });
  } catch (error) {
    if (error.name === 'AbortError') return new TurnSummary({ ok: false, fault: 'aborted' });
    return new TurnSummary({ ok: false, fault: `ollama error: ${error.message}` });
  }
}
