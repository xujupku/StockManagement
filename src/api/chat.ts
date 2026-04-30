const API_URL = '/api/v1/run_stream';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** 将多轮对话拼成单个 query 字符串供 Hermes Agent 使用 */
function buildQuery(messages: ChatMessage[]): string {
  return messages
    .map(m => {
      if (m.role === 'system') return `[系统指令] ${m.content}`;
      if (m.role === 'user') return `[用户] ${m.content}`;
      return `[助手] ${m.content}`;
    })
    .join('\n');
}

export async function chatWithAIStream(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: buildQuery(messages) }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`请求失败 (${response.status}): ${errText || response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法获取响应流');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return;
      if (data.startsWith('[ERROR]')) {
        throw new Error(data.slice(8));
      }
      onChunk(data);
    }
  }
}
