const API_URL = '/api/v1/run';

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

  const data = await response.json();
  const text = data.response || '';
  if (text) {
    onChunk(text);
  }
}
