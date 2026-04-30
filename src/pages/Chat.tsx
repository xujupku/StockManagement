import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { chatWithAIStream, type ChatMessage } from '../api/chat';

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function Chat() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: DisplayMessage = { role: 'user', content: text };
    const prevMessages = [...messages, userMsg];
    setMessages(prevMessages);
    setInput('');
    setLoading(true);

    const assistantIdx = prevMessages.length;
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const apiMessages: ChatMessage[] = [
        { role: 'system', content: '你是一个专业的股票投资顾问。请根据用户的问题，提供专业、客观的股票分析和投资建议。回答应简洁明了，包含关键数据和逻辑依据。' },
        ...messages.map(m => ({ role: m.role, content: m.content } as ChatMessage)),
        { role: 'user' as const, content: text },
      ];

      await chatWithAIStream(
        apiMessages,
        (chunk) => {
          setMessages(prev => {
            const updated = [...prev];
            updated[assistantIdx] = {
              ...updated[assistantIdx],
              content: updated[assistantIdx].content + chunk,
            };
            return updated;
          });
        },
        abortController.signal,
      );
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setMessages(prev => {
        const updated = [...prev];
        const current = updated[assistantIdx];
        if (current && !current.content) {
          updated[assistantIdx] = { role: 'assistant', content: `⚠️ ${e.message || '请求失败，请稍后重试'}` };
        }
        return updated;
      });
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }, [input, loading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearMessages = () => {
    if (loading) return;
    setMessages([]);
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-4rem)] flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">AI 股票咨询</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">随时询问股票相关问题，获取专业投资建议</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-red-300 dark:hover:border-red-500/30 transition disabled:opacity-50"
          >
            清空对话
          </button>
        )}
      </div>

      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm px-6 py-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
            <svg className="w-16 h-16 mb-4 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-base font-medium">有什么股票问题想咨询？</p>
            <p className="text-sm mt-2">例如：帮我分析一下贵州茅台、微软股票是否值得投资</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-indigo-500 text-white rounded-br-md whitespace-pre-wrap'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-md'
            }`}>
              {msg.role === 'assistant' && msg.content ? (
                <div className="chat-markdown prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-2 prose-code:text-xs prose-code:bg-gray-200 prose-code:dark:bg-gray-700 prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : msg.content ? (
                msg.content
              ) : (loading && i === messages.length - 1 ? (
                <div className="flex items-center gap-1.5 py-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              ) : null)}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 */}
      <div className="mt-4 flex items-end gap-3">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入股票相关问题... (Enter 发送，Shift+Enter 换行)"
          rows={2}
          className="flex-1 resize-none px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-400 shadow-sm"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className={`shrink-0 px-5 py-3 rounded-xl font-medium text-sm transition shadow-sm ${
            input.trim() && !loading
              ? 'bg-indigo-500 text-white hover:bg-indigo-600'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
          }`}
        >
          {loading ? '思考中...' : '发送'}
        </button>
      </div>
    </div>
  );
}
