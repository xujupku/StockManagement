import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { chatWithAIStream, type ChatMessage } from '../api/chat';
import { authFetch } from '../api/authFetch';

interface DisplayMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

/** 修复被压平的 markdown 表格（换行符丢失导致表格无法渲染） */
function fixMarkdownTables(text: string): string {
  if (/\|\s*\n\s*\|[-:]/.test(text)) return text;
  const sepRegex = /(\|[\s]*[-:]+[-:\s]*(?:\|[\s]*[-:]+[-:\s]*)+\|)/;
  const sepMatch = text.match(sepRegex);
  if (!sepMatch) return text;
  const separator = sepMatch[1];
  const colCount = (separator.match(/\|/g) || []).length - 1;
  if (colCount < 2) return text;
  const sepIdx = text.indexOf(separator);
  const beforeSep = text.substring(0, sepIdx);
  const afterSep = text.substring(sepIdx + separator.length);
  const cellPattern = '[^|]+';
  const rowRegex = new RegExp('\\|' + (cellPattern + '\\|').repeat(colCount), 'g');
  function extractRows(segment: string): string {
    const matches = segment.match(rowRegex);
    if (!matches) return '';
    return matches.join('\n');
  }
  const beforeLines = beforeSep.split('\n');
  const nonTableLines: string[] = [];
  let headerSegment = '';
  for (let i = beforeLines.length - 1; i >= 0; i--) {
    if (beforeLines[i].includes('|')) {
      headerSegment = beforeLines.slice(i).join(' ');
      nonTableLines.push(...beforeLines.slice(0, i));
      break;
    }
    if (i === 0) { headerSegment = beforeSep; }
  }
  const headerRows = extractRows(headerSegment);
  const dataRows = extractRows(afterSep);
  const prefix = nonTableLines.join('\n');
  const table = [headerRows, separator.trim(), dataRows].filter(Boolean).join('\n');
  return (prefix ? prefix + '\n\n' : '') + table;
}

export default function ChatDialog() {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConv, setCurrentConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // 加载会话列表（只加载 chat 类型）
  const loadConversations = useCallback(async () => {
    try {
      const res = await authFetch('/api/conversations?type=chat');
      const data = await res.json();
      setConversations(data);
    } catch (e) {
      console.error('加载会话列表失败', e);
    }
  }, []);

  // 打开时加载会话列表
  useEffect(() => {
    if (open) loadConversations();
  }, [open, loadConversations]);

  // 加载会话消息
  const loadMessages = useCallback(async (convId: string) => {
    try {
      const res = await authFetch(`/api/conversations/${convId}/messages`);
      const data: DisplayMessage[] = await res.json();
      setMessages(data.map(m => ({ ...m, role: m.role as 'user' | 'assistant' })));
    } catch (e) {
      console.error('加载消息失败', e);
      setMessages([]);
    }
  }, []);

  // 选择会话
  const selectConversation = useCallback(async (conv: Conversation) => {
    setCurrentConv(conv);
    setShowHistory(false);
    await loadMessages(conv.id);
  }, [loadMessages]);

  // 新建会话
  const createNewConversation = useCallback(async () => {
    try {
      const res = await authFetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '新对话', type: 'chat' }),
      });
      const conv: Conversation = await res.json();
      setCurrentConv(conv);
      setMessages([]);
      setShowHistory(false);
      loadConversations();
    } catch (e) {
      console.error('创建会话失败', e);
    }
  }, [loadConversations]);

  // 删除会话
  const deleteConversation = useCallback(async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await authFetch(`/api/conversations/${convId}`, { method: 'DELETE' });
      if (currentConv?.id === convId) {
        setCurrentConv(null);
        setMessages([]);
      }
      loadConversations();
    } catch (err) {
      console.error('删除失败', err);
    }
  }, [currentConv, loadConversations]);

  // 保存消息到数据库
  const saveMessage = useCallback(async (convId: string, role: string, content: string) => {
    try {
      await authFetch(`/api/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content }),
      });
    } catch (e) {
      console.error('保存消息失败', e);
    }
  }, []);

  // 更新会话标题（取第一条用户消息前 20 字）
  const updateTitle = useCallback(async (convId: string, content: string) => {
    const title = content.slice(0, 20) + (content.length > 20 ? '...' : '');
    try {
      await authFetch(`/api/conversations/${convId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      loadConversations();
    } catch (e) {
      console.error('更新标题失败', e);
    }
  }, [loadConversations]);

  // 发送消息
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    // 如果没有当前会话，先创建
    let convId = currentConv?.id;
    if (!convId) {
      try {
        const res = await authFetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: '新对话', type: 'chat' }),
        });
        const conv: Conversation = await res.json();
        convId = conv.id;
        setCurrentConv(conv);
        loadConversations();
      } catch (e) {
        console.error('创建会话失败', e);
        return;
      }
    }

    const userMsg: DisplayMessage = { role: 'user', content: text };
    const prevMessages = [...messages, userMsg];
    setMessages(prevMessages);
    setInput('');
    setLoading(true);

    // 保存用户消息
    saveMessage(convId!, 'user', text);

    // 更新标题（第一条用户消息）
    if (messages.length === 0) {
      updateTitle(convId!, text);
    }

    // 先添加一条空的 assistant 消息
    const assistantIdx = prevMessages.length;
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const apiMessages: ChatMessage[] = [
        { role: 'system', content: '你是一个专业的股票投资顾问。请根据用户的问题，提供专业、客观的股票分析和投资建议。回答应简洁明了，包含关键数据和逻辑依据。' },
        ...prevMessages.map(m => ({ role: m.role, content: m.content } as ChatMessage)),
      ];

      let fullResponse = '';
      await chatWithAIStream(
        apiMessages,
        (chunk) => {
          fullResponse += chunk;
          setMessages(prev => {
            const updated = [...prev];
            updated[assistantIdx] = {
              ...updated[assistantIdx],
              content: fullResponse,
            };
            return updated;
          });
        },
        {
          onFinal: (finalContent: string) => {
            fullResponse = finalContent;
            setMessages(prev => {
              const updated = [...prev];
              updated[assistantIdx] = {
                ...updated[assistantIdx],
                content: finalContent,
              };
              return updated;
            });
          },
          signal: abortController.signal,
        },
      );

      // 保存助手回复
      saveMessage(convId!, 'assistant', fullResponse);
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setMessages(prev => {
        const updated = [...prev];
        const current = updated[assistantIdx];
        if (current && !current.content) {
          updated[assistantIdx] = { role: 'assistant', content: `⚠️ ${e.message || '请求失败'}` };
        }
        return updated;
      });
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }, [input, loading, messages, currentConv, saveMessage, updateTitle]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* 浮动按钮 */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 z-50"
      >
        {open ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>

      {/* 对话框 */}
      {open && (
        <div className="fixed bottom-24 right-6 w-[420px] h-[560px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex z-50 overflow-hidden">
          {/* 历史侧边栏 */}
          {showHistory && (
            <div className="w-44 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-gray-50 dark:bg-gray-800">
              <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">历史记录</span>
                <button
                  onClick={createNewConversation}
                  className="text-indigo-500 hover:text-indigo-600 text-xs font-medium"
                >
                  + 新对话
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                  <div className="p-4 text-center text-gray-400 text-xs">暂无历史记录</div>
                ) : (
                  conversations.map(conv => (
                    <div
                      key={conv.id}
                      onClick={() => selectConversation(conv)}
                      className={`group px-3 py-2.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between ${
                        currentConv?.id === conv.id ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-700 dark:text-gray-200 truncate">{conv.title}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {new Date(conv.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={(e) => deleteConversation(conv.id, e)}
                        className="opacity-0 group-hover:opacity-100 ml-2 text-gray-400 hover:text-red-500"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 主聊天区域 */}
          <div className="flex-1 flex flex-col">
            {/* 头部 */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="mr-2 text-white/80 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-semibold text-sm truncate">
                  {currentConv?.title || 'AI 股票咨询助手'}
                </h3>
                <p className="text-indigo-100 text-xs mt-0.5">随时询问股票相关问题</p>
              </div>
              {!showHistory && (
                <button
                  onClick={createNewConversation}
                  className="text-white/80 hover:text-white text-xs"
                >
                  新对话
                </button>
              )}
            </div>

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
                  <svg className="w-12 h-12 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p>有什么股票问题想咨询？</p>
                  <p className="text-xs mt-1">例如：帮我分析一下贵州茅台</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={msg.id || i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-indigo-500 text-white rounded-br-md whitespace-pre-wrap'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-md'
                  }`}>
                    {msg.role === 'assistant' && msg.content ? (
                      <div className="chat-markdown prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-2 prose-code:text-xs prose-code:bg-gray-200 prose-code:dark:bg-gray-700 prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            table: ({ children }) => (
                              <div style={{ overflowX: 'auto' }}>
                                <table>{children}</table>
                              </div>
                            ),
                          }}
                        >{fixMarkdownTables(msg.content)}</ReactMarkdown>
                      </div>
                    ) : msg.content ? (
                      msg.content
                    ) : (loading && i === messages.length - 1 ? (
                      <div className="flex items-center gap-1.5">
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
            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入股票相关问题..."
                  rows={1}
                  className="flex-1 resize-none px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-400"
                />
                {loading ? (
                  <button
                    onClick={() => abortRef.current?.abort()}
                    className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-red-500 text-white hover:bg-red-600 transition"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition ${
                      input.trim()
                        ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
