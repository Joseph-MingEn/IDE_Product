type OllamaChatResponse = {
  message?: { role: string; content: string };
  error?: string;
  done?: boolean;
};

export type OllamaChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

function buildMessages(
  userText: string,
  systemInstruction?: string,
): OllamaChatMessage[] {
  return typeof systemInstruction === 'string' && systemInstruction.trim().length > 0
    ? [
        { role: 'system' as const, content: systemInstruction },
        { role: 'user' as const, content: userText },
      ]
    : [{ role: 'user' as const, content: userText }];
}

export async function ollamaChat(
  baseUrl: string,
  model: string,
  userText: string,
  systemInstruction?: string,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;
  const body = {
    model,
    messages: buildMessages(userText, systemInstruction),
    stream: false,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as OllamaChatResponse;
  if (!res.ok) {
    const err = typeof data.error === 'string' ? data.error : res.statusText;
    throw new Error(err || `HTTP ${res.status}`);
  }
  const text = data.message?.content;
  if (typeof text !== 'string') {
    throw new Error('Invalid Ollama response: missing message.content');
  }
  return text;
}

/**
 * Streams Ollama /api/chat (NDJSON) with a full messages array.
 * Invokes onDelta for each message.content chunk.
 */
export async function ollamaChatMessagesStream(
  baseUrl: string,
  model: string,
  messages: OllamaChatMessage[],
  onDelta: (chunk: string) => void,
): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;
  const body = {
    model,
    messages,
    stream: true,
  };
  console.log('[Local AI] ollamaChatMessagesStream messages', messages);
  console.log('[Local AI] fetch /api/chat body.messages', body.messages);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let err = res.statusText;
    try {
      const data = (await res.json()) as OllamaChatResponse;
      if (typeof data.error === 'string') {
        err = data.error;
      }
    } catch {
      // use statusText
    }
    throw new Error(err || `HTTP ${res.status}`);
  }
  if (!res.body) {
    throw new Error('Ollama stream response has no body');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
          continue;
        }
        parseOllamaStreamLine(trimmed, onDelta);
      }
    }
    const tail = buffer.trim();
    if (tail.length > 0) {
      parseOllamaStreamLine(tail, onDelta);
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Streams Ollama /api/chat (NDJSON). Single user turn + optional system prompt.
 */
export async function ollamaChatStream(
  baseUrl: string,
  model: string,
  userText: string,
  onDelta: (chunk: string) => void,
  systemInstruction?: string,
): Promise<void> {
  return ollamaChatMessagesStream(baseUrl, model, buildMessages(userText, systemInstruction), onDelta);
}

function parseOllamaStreamLine(line: string, onDelta: (chunk: string) => void): void {
  let data: OllamaChatResponse;
  try {
    data = JSON.parse(line) as OllamaChatResponse;
  } catch {
    throw new Error('Invalid Ollama stream line: not JSON');
  }
  if (typeof data.error === 'string' && data.error.length > 0) {
    throw new Error(data.error);
  }
  const content = data.message?.content;
  if (typeof content === 'string' && content.length > 0) {
    onDelta(content);
  }
}
