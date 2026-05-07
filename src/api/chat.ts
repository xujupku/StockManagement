import { authFetch } from './authFetch';
import { getApiConfig } from './config';

const API_URL = '/api/v1/run_stream';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ToolEvent {
  type: 'tool_start' | 'tool_complete';
  name: string;
  args?: Record<string, string>;
}

export interface StreamOptions {
  onFinal?: (text: string) => void;
  onToolEvent?: (event: ToolEvent) => void;
  signal?: AbortSignal;
}

/**
 * 流式对话
 */
export async function chatWithAIStream(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  options?: StreamOptions,
): Promise<void> {
  const { onFinal, onToolEvent, signal } = options || {};

  // 最后一条 user 消息作为 query，其余作为 history
  const query = messages[messages.length - 1]?.content || '';
  const history = messages.slice(0, -1);

  const response = await authFetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      messages: history,
      api_key: getApiConfig().apiKey || undefined,
      exa_key: getApiConfig().exaKey || undefined,
    }),
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

    // 按 SSE 格式解析：每条消息以 \n\n 分隔
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data: ')) continue;

      const raw = line.slice(6);
      if (raw === '[DONE]') return;

      let msg: { type: string; content: any };
      try {
        msg = JSON.parse(raw);
      } catch {
        continue;
      }

      if (msg.type === 'error') {
        throw new Error(msg.content);
      }

      if (msg.type === 'tool_start' || msg.type === 'tool_complete') {
        if (onToolEvent) {
          onToolEvent({ type: msg.type, name: msg.content.name, args: msg.content.args });
        }
      } else if (msg.type === 'delta') {
        onChunk(msg.content);
      } else if (msg.type === 'final' && onFinal) {
        onFinal(msg.content);
      }
    }
  }
}
