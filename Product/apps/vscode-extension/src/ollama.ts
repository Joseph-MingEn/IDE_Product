type OllamaChatResponse = {
  message?: { role: string; content: string };
  error?: string;
};

export async function ollamaChat(
  baseUrl: string,
  model: string,
  userText: string,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;
  const body = {
    model,
    messages: [{ role: 'user', content: userText }],
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
