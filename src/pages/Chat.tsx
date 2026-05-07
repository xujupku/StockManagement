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
  const abortRef = useRef<AbortController | null>(null);
  const isInitialLoad = useRef(true);
  const userScrolledUp = useRef(false);

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

    try {
      let fullResponse = '';
      await chatWithAIStream(
        text,
        convId,
        (chunk) => {
          fullResponse += chunk;
          setMessages(prev => {
            const updated = [...prev];
            updated[assistantIdx] = { ...updated[assistantIdx], content: fullResponse, streaming: true };
            return updated;
          });
        },
        {
          onFinal: (finalContent) => {
            fullResponse = finalContent;
            setMessages(prev => {
              const updated = [...prev];
              updated[assistantIdx] = { ...updated[assistantIdx], content: finalContent, streaming: false };
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

      // 流结束后标记非 streaming
      setMessages(prev => {
        const updated = [...prev];
        if (updated[assistantIdx]) {
          updated[assistantIdx] = { ...updated[assistantIdx], streaming: false };
        }
        return updated;
      });
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
    <div className="h-[calc(100vh-3.25rem)] md:h-screen -m-4 md:-m-8 flex flex-col md:flex-row bg-white dark:bg-gray-950 overflow-hidden">
      {/* 左侧：历史会话列表 */}
      {/* 移动端遮罩 */}
      {showHistory && (
        <div
          className="md:hidden fixed inset-0 bg-black/30 z-20"
          onClick={() => setShowHistory(false)}
        />
      )}
      <div className={`
        w-56 shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900
        fixed md:static inset-y-0 left-0 z-30 md:z-auto transition-transform duration-300
        ${showHistory ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">历史会话</span>
          <div className="flex items-center gap-1">
            <button
              onClick={createNewConversation}
              className="px-2 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition"
            >
              + 新对话
            </button>
            <button
              onClick={() => setShowHistory(false)}
              className="md:hidden p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-xs">暂无历史会话</div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className={`group px-3 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 flex items-center justify-between transition ${
                  currentConv?.id === conv.id ? 'bg-indigo-50 dark:bg-indigo-900/20 border-r-2 border-indigo-500' : ''
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
                  className="opacity-0 group-hover:opacity-100 ml-2 p-1 text-gray-400 hover:text-red-500 rounded transition"
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
              className="md:hidden shrink-0 p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
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
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入问题... (Enter发送)"
              rows={1}
              className="flex-1 resize-none px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-400 shadow-sm"
            />
            {loading ? (
              <button
                onClick={() => abortRef.current?.abort()}
                className="shrink-0 px-3 md:px-4 py-2 rounded-xl font-medium text-sm transition shadow-sm bg-red-500 text-white hover:bg-red-600"
              >
                停止
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className={`shrink-0 px-3 md:px-4 py-2 rounded-xl font-medium text-sm transition shadow-sm ${
                  input.trim()
                    ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
              >
                发送
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
