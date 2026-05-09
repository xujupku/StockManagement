import { authFetch } from './authFetch';
import { getApiConfig } from './config';

const API_URL = '/api/v1/run_stream';

export interface ToolEvent {
  type: 'tool_start' | 'tool_complete';
  name: string;
  args?: Record<string, string>;
}

export interface StreamOptions {
  onFinal?: (text: string) => void;
  onToolEvent?: (event: ToolEvent) => void;
  onSegmentReset?: () => void;  // 工具开始时调用，通知重置之前的中间文本
  signal?: AbortSignal;
}

export async function chatWithAIStream(
  query: string,
  convId: string | null,
  onChunk: (text: string) => void,
  options?: StreamOptions,
): Promise<void> {
  const { onFinal, onToolEvent, onSegmentReset, signal } = options || {};

  const response = await authFetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      conv_id: convId,
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
        if (msg.type === 'tool_start' && onSegmentReset) {
          onSegmentReset();
        }
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
