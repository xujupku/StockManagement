import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { chatWithAIStream, type ToolEvent } from '../api/chat';
import { authFetch } from '../api/authFetch';

interface DisplayMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

/** 修复被压平的 markdown 表格 */
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

const TOOL_NAMES: Record<string, string> = {
  web_search: '网络搜索',
  web_extract: '网页提取',
  browser_navigate: '浏览网页',
  read_file: '读取文件',
  write_file: '写入文件',
  run_command: '执行命令',
  search_code: '搜索代码',
};

function getToolDisplayName(name: string): string {
  return TOOL_NAMES[name] || name;
}

export default function Chat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConv, setCurrentConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isInitialLoad = useRef(true);
  const userScrolledUp = useRef(false);
  // 流式节流：避免每个 chunk 都触发 ReactMarkdown 重渲染
  const streamBufferRef = useRef('');
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // textarea 自动增高
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // 最多 5 行高度 (5 * lineHeight ~20px + padding)
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  useEffect(() => { autoResize(); }, [input, autoResize]);

  // 检测用户是否手动上滑
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    userScrolledUp.current = distanceFromBottom > 80;
  }, []);

  useEffect(() => {
    if (userScrolledUp.current && !isInitialLoad.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: isInitialLoad.current ? 'instant' : 'smooth' });
    isInitialLoad.current = false;
  }, [messages, loading]);

  // 加载会话消息
  const loadMessages = useCallback(async (convId: string) => {
    isInitialLoad.current = true;
    try {
      const res = await authFetch(`/api/conversations/${convId}/messages`);
      const data = await res.json();
      setMessages(data.map((m: any) => ({ ...m, role: m.role as 'user' | 'assistant' })));
    } catch (e) {
      console.error('加载消息失败', e);
      setMessages([]);
    }
  }, []);

  // 加载会话列表（只加载 chat 类型）
  const loadConversations = useCallback(async () => {
    try {
      const res = await authFetch('/api/conversations?type=chat');
      const data = await res.json();
      setConversations(data);
      // 有历史记录时自动选中最新一条
      if (data.length > 0) {
        const latest = data[0];
        setCurrentConv(latest);
        await loadMessages(latest.id);
      }
    } catch (e) {
      console.error('加载会话列表失败', e);
    }
  }, [loadMessages]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // 选择会话
  const selectConversation = useCallback(async (conv: Conversation) => {
    setCurrentConv(conv);
    setShowHistory(false);
    await loadMessages(conv.id);
  }, [loadMessages]);

  // 新建会话
  const createNewConversation = useCallback(async () => {
    setCurrentConv(null);
    setMessages([]);
    setShowHistory(false);
  }, []);

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

  // 保存消息
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

  // 更新标题
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
    userScrolledUp.current = false;

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

    saveMessage(convId!, 'user', text);
    if (messages.length === 0) {
      updateTitle(convId!, text);
    }

    const assistantIdx = prevMessages.length;
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

    const abortController = new AbortController();
    abortRef.current = abortController;

    let fullResponse = '';
    try {
      streamBufferRef.current = '';

      const flushStreamBuffer = (idx: number) => {
        const content = streamBufferRef.current;
        setMessages(prev => {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], content, streaming: true };
          return updated;
        });
      };

      await chatWithAIStream(
        text,
        convId,
        (chunk) => {
          fullResponse += chunk;
          streamBufferRef.current = fullResponse;
          // 节流：最多每 80ms 触发一次 React 重渲染
          if (!throttleTimerRef.current) {
            flushStreamBuffer(assistantIdx);
            throttleTimerRef.current = setTimeout(() => {
              throttleTimerRef.current = null;
              // 定时器到期时再刷一次，确保最新内容可见
              flushStreamBuffer(assistantIdx);
            }, 80);
          }
        },
        {
          onFinal: (finalContent) => {
            // 仅当 final 非空时才覆盖，防止空 final 清除已有 delta 拼接内容
            if (finalContent) {
              fullResponse = finalContent;
            }
            // 清理节流定时器
            if (throttleTimerRef.current) {
              clearTimeout(throttleTimerRef.current);
              throttleTimerRef.current = null;
            }
            setMessages(prev => {
              const updated = [...prev];
              updated[assistantIdx] = { ...updated[assistantIdx], content: fullResponse, streaming: false };
              return updated;
            });
            setToolStatus('');
          },
          onToolEvent: (event: ToolEvent) => {
            const name = getToolDisplayName(event.name);
            if (event.type === 'tool_start') {
              setToolStatus(`🔧 正在执行: ${name}...`);
            } else {
              setToolStatus(`✅ 已完成: ${name}`);
            }
          },
          signal: abortController.signal,
        },
      );

      // 流结束后清理节流定时器，标记非 streaming
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      setMessages(prev => {
        const updated = [...prev];
        if (updated[assistantIdx]) {
          updated[assistantIdx] = { ...updated[assistantIdx], content: fullResponse, streaming: false };
        }
        return updated;
      });
      saveMessage(convId!, 'assistant', fullResponse);
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      // 清理节流定时器
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      // 连接断开但已有部分内容时，保存已积累的内容防止丢失
      if (fullResponse) {
        setMessages(prev => {
          const updated = [...prev];
          if (updated[assistantIdx]) {
            updated[assistantIdx] = { ...updated[assistantIdx], content: fullResponse, streaming: false };
          }
          return updated;
        });
        saveMessage(convId!, 'assistant', fullResponse);
      } else {
        setMessages(prev => {
          const updated = [...prev];
          const current = updated[assistantIdx];
          if (current && !current.content) {
            updated[assistantIdx] = { role: 'assistant', content: `⚠️ ${e.message || '请求失败'}` };
          }
          return updated;
        });
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
      setToolStatus('');
    }
  }, [input, loading, messages, currentConv, saveMessage, updateTitle, loadConversations]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full md:h-full -m-4 md:-m-8 flex flex-col md:flex-row bg-white dark:bg-gray-950 overflow-hidden">
      {/* 左侧：历史会话列表 */}
      {/* 移动端遮罩 */}
      {showHistory && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-20"
          onClick={() => setShowHistory(false)}
        />
      )}
      {/* 移动端：底部弹出面板 / 桌面端：左侧侧边栏 */}
      <div className={`
        md:w-56 md:shrink-0 md:border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900
        fixed md:static z-30 md:z-auto transition-transform duration-300 ease-out
        inset-x-0 bottom-0 max-h-[65vh] rounded-t-2xl md:rounded-none md:inset-y-0 md:left-0 md:max-h-none md:h-auto
        ${showHistory ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
      `}>
        {/* 移动端拖拽指示器 */}
        <div className="md:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">历史会话</span>
          <button
            onClick={createNewConversation}
            className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 rounded-lg transition"
          >
            + 新对话
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+3.5rem)] md:pb-0">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-xs">暂无历史会话</div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className={`group px-4 py-3 cursor-pointer flex items-center justify-between transition active:bg-gray-100 dark:active:bg-gray-700/50 ${
                  currentConv?.id === conv.id ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-2 md:border-l-0 md:border-r-2 border-indigo-500' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-700 dark:text-gray-200 truncate">{conv.title}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {new Date(conv.updated_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={(e) => deleteConversation(conv.id, e)}
                  className="ml-2 p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition md:opacity-0 md:group-hover:opacity-100"
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

      {/* 右侧：聊天区域 */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* 头部 */}
        <div className="px-3 md:px-6 py-2 md:py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setShowHistory(true)}
              className="md:hidden shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 transition"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <div className="min-w-0">
              <h2 className="text-sm md:text-lg font-bold text-gray-900 dark:text-white truncate">
                {currentConv?.title || 'AI 股票咨询'}
              </h2>
              <p className="hidden md:block text-xs text-gray-500 dark:text-gray-400 mt-0.5">随时询问股票相关问题，获取专业投资建议</p>
            </div>
          </div>
          <button
            onClick={createNewConversation}
            className="md:hidden shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 active:bg-indigo-100 transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* 消息区域 */}
        <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto overflow-x-hidden px-3 md:px-6 py-3 md:py-4">
          <div className="max-w-5xl mx-auto space-y-3 md:space-y-4">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 py-8">
              <svg className="w-12 md:w-16 h-12 md:h-16 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-sm md:text-base font-medium">有什么股票问题想咨询？</p>
              <p className="text-xs md:text-sm mt-1.5">例如：帮我分析一下贵州茅台是否值得投资</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={msg.id || i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[92%] md:max-w-[85%] min-w-0 overflow-hidden px-3 md:px-4 py-2 md:py-3 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-500 text-white rounded-br-md whitespace-pre-wrap break-words'
                  : 'bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-md'
              }`}>
                {msg.role === 'assistant' && msg.content ? (
                  <div className="chat-markdown prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-2">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: ({ children }) => (
                          <div style={{ overflowX: 'auto' }}>
                            <table>{children}</table>
                          </div>
                        ),
                      }}
                    >{msg.streaming ? msg.content : fixMarkdownTables(msg.content)}</ReactMarkdown>
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
        </div>

        {/* 工具状态指示器 */}
        {toolStatus && (
          <div className="px-3 md:px-6 py-1.5 border-t border-gray-50 dark:border-gray-800 shrink-0">
            <div className="text-xs text-gray-500 dark:text-gray-400 animate-pulse">
              {toolStatus}
            </div>
          </div>
        )}

        {/* 输入区 */}
        <div className="px-3 md:px-6 py-2 md:py-3 border-t border-gray-100 dark:border-gray-800 shrink-0">
          <div className="max-w-5xl mx-auto flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入问题..."
              rows={1}
              className="flex-1 resize-none px-4 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-gray-800 outline-none placeholder-gray-400 transition max-h-[120px] overflow-y-auto"
            />
            {loading ? (
              <button
                onClick={() => abortRef.current?.abort()}
                className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full font-medium text-sm transition bg-red-500 text-white active:bg-red-600 shadow-sm"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h12v12H6z" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-full font-medium text-sm transition shadow-sm ${
                  input.trim()
                    ? 'bg-indigo-500 text-white active:bg-indigo-600'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
