import { useState, useRef, useEffect, useCallback } from 'react';
import { authFetch } from '../api/authFetch';
import { getApiConfig } from '../api/config';

// ===== 表单选项 =====

const BUDGET_OPTIONS = [
  { value: '5000', label: '5,000 以内' },
  { value: '20000', label: '5,000 - 20,000' },
  { value: '50000', label: '20,000 - 50,000' },
  { value: '100000', label: '50,000 - 100,000' },
  { value: '500000', label: '10万 - 50万' },
  { value: '1000000', label: '50万以上' },
];

const HORIZON_OPTIONS = [
  { value: 'ultra_short', label: '1周以内', icon: '⚡' },
  { value: 'short', label: '1-3个月', icon: '📆' },
  { value: 'medium', label: '3-12个月', icon: '📅' },
  { value: 'long', label: '1-3年', icon: '🏔️' },
  { value: 'very_long', label: '3年以上', icon: '🏛️' },
];

const RISK_OPTIONS = [
  { value: 'low', label: '低风险', desc: '追求稳健，最多能承受5%回撤', icon: '🛡️', color: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' },
  { value: 'medium', label: '中风险', desc: '可接受10-15%波动，追求稳定增长', icon: '⚖️', color: 'border-yellow-400 bg-yellow-50 dark:bg-yellow-500/10' },
  { value: 'high', label: '高风险', desc: '能承受30%以上波动，追求高回报', icon: '🔥', color: 'border-red-400 bg-red-50 dark:bg-red-500/10' },
];

const INDUSTRY_OPTIONS = [
  { value: 'tech', label: '科技', icon: '💻' },
  { value: 'finance', label: '金融', icon: '🏦' },
  { value: 'medical', label: '医疗健康', icon: '🏥' },
  { value: 'consumer', label: '消费', icon: '🛒' },
  { value: 'energy', label: '能源', icon: '⚡' },
  { value: 'manufacture', label: '制造业', icon: '🏭' },
  { value: 'realestate', label: '房地产', icon: '🏠' },
  { value: 'auto', label: '新能源汽车', icon: '🚗' },
  { value: 'semiconductor', label: '半导体', icon: '🔬' },
  { value: 'ai', label: '人工智能', icon: '🤖' },
  { value: 'any', label: '不限行业', icon: '🌐' },
];

const MARKET_OPTIONS = [
  { value: 'a', label: 'A股', icon: '🇨🇳' },
  { value: 'hk', label: '港股', icon: '🇭🇰' },
  { value: 'us', label: '美股', icon: '🇺🇸' },
];

// ===== 推荐结果类型 =====

interface StockRecommendation {
  code: string;
  name: string;
  market: string;
  industry: string;
  currentPrice: number;
  currency: string;
  targetPrice: number;
  upside: number;
  rating: 'strong_buy' | 'buy' | 'hold';
  riskLevel: string;
  reasons: string[];
  highlights: string;
}

interface PickerForm {
  budget: string;
  horizon: string;
  risk: string;
  industries: string[];
  markets: string[];
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

// ===== 任务状态（全局，不受组件卸载影响） =====

interface PickerTask {
  conversationId: string;
  status: 'running' | 'completed' | 'failed';
  progressText: string;
  results: StockRecommendation[] | null;
  error: string | null;
}

const globalTasks = new Map<string, PickerTask>();

// 后台执行选股任务
async function runPickerTask(
  conversationId: string,
  query: string,
  onProgress?: (text: string) => void,
) {
  const task: PickerTask = {
    conversationId,
    status: 'running',
    progressText: '',
    results: null,
    error: null,
  };
  globalTasks.set(conversationId, task);

  try {
    const response = await authFetch('/api/v1/run_stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, api_key: getApiConfig().apiKey || undefined, exa_key: getApiConfig().exaKey || undefined }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`请求失败 (${response.status}): ${errText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('无法获取响应流');

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

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
        if (raw === '[DONE]') break;

        let msg: { type: string; content: string };
        try { msg = JSON.parse(raw); } catch { continue; }

        if (msg.type === 'error') throw new Error(msg.content);

        if (msg.type === 'delta') {
          fullText += msg.content;
          task.progressText = fullText;
          onProgress?.(fullText);
        } else if (msg.type === 'final') {
          fullText = msg.content;
          task.progressText = fullText;
          onProgress?.(fullText);
        }
      }
    }

    if (!fullText) throw new Error('AI 未返回有效结果');

    const recommendations = parseRecommendations(fullText);
    task.results = recommendations;
    task.status = 'completed';

    // 保存助手回复到数据库
    await authFetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'assistant', content: fullText }),
    });

    return recommendations;
  } catch (e: any) {
    task.status = 'failed';
    task.error = e.message || '选股失败';
    throw e;
  }
}

const DEFAULT_FORM: PickerForm = {
  budget: '50000',
  horizon: 'medium',
  risk: 'medium',
  industries: ['tech'],
  markets: ['a', 'us'],
};

const RATING_STYLES: Record<string, { text: string; color: string }> = {
  strong_buy: { text: '强烈推荐', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  buy: { text: '推荐买入', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  hold: { text: '建议关注', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400' },
};

const FORM_STORAGE_KEY = 'ai_stock_picker_form';

function loadForm(): PickerForm {
  try {
    const raw = localStorage.getItem(FORM_STORAGE_KEY);
    if (raw) return { ...DEFAULT_FORM, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_FORM;
}

// ===== 构建 AI 查询 =====

function buildQuery(form: PickerForm): string {
  const budgetLabel = BUDGET_OPTIONS.find(o => o.value === form.budget)?.label || form.budget;
  const horizonLabel = HORIZON_OPTIONS.find(o => o.value === form.horizon)?.label || form.horizon;
  const riskLabel = RISK_OPTIONS.find(o => o.value === form.risk)?.label || form.risk;
  const industryLabels = form.industries.map(v => INDUSTRY_OPTIONS.find(o => o.value === v)?.label || v).join('、');
  const marketLabels = form.markets.map(v => MARKET_OPTIONS.find(o => o.value === v)?.label || v).join('、');

  const fence = '```';

  return '请使用 stock-picker skill 为我进行股票筛选和推荐。\n\n' +
    '投资条件：\n' +
    `- 投资预算：${budgetLabel}\n` +
    `- 投资期限：${horizonLabel}\n` +
    `- 风险承受：${riskLabel}\n` +
    `- 偏好行业：${industryLabels}\n` +
    `- 目标市场：${marketLabels}\n\n` +
    `请按照 stock-picker skill 的完整流程执行分析，并在最后输出以下 JSON 格式的推荐结果（必须包含在 ${fence}json 代码块中）。\n` +
    `【重要】JSON 代码块必须是你整个回复的最后一段内容，代码块结束后不要再输出任何文字。\n\n` +
    fence + 'json\n' +
    '[\n' +
    '  {\n' +
    '    "code": "股票代码",\n' +
    '    "name": "股票名称",\n' +
    '    "market": "a/hk/us",\n' +
    '    "industry": "所属行业",\n' +
    '    "currentPrice": 当前价格数字,\n' +
    '    "currency": "¥/$/HK$",\n' +
    '    "targetPrice": 目标价格数字,\n' +
    '    "upside": 预期涨幅百分比数字,\n' +
    '    "rating": "strong_buy/buy/hold",\n' +
    '    "riskLevel": "低/中低/中/中高/高",\n' +
    '    "reasons": ["理由1", "理由2", "理由3"],\n' +
    '    "highlights": "一句话核心亮点"\n' +
    '  }\n' +
    ']\n' +
    fence;
}

// ===== 解析 AI 响应 =====

function parseRecommendations(text: string): StockRecommendation[] {
  // 尝试从所有 markdown 代码块中提取 JSON（取最后一个有效的）
  const allJsonBlocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  for (let i = allJsonBlocks.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(allJsonBlocks[i][1].trim());
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].code) {
        return parsed.map(normalizeStockItem);
      }
    } catch { /* 继续尝试其他代码块 */ }
  }

  // 尝试匹配最长的顶层 JSON 数组（贪婪，从 [ 到最后一个 ]）
  const arrayMatches = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arrayMatches) {
    try {
      const parsed = JSON.parse(arrayMatches[0]);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].code) {
        return parsed.map(normalizeStockItem);
      }
    } catch { /* ignore */ }
  }

  // 最后尝试：逐行扫描找到 JSON 数组的起止位置
  const lines = text.split('\n');
  let startIdx = -1;
  let bracketCount = 0;
  let jsonStr = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (startIdx === -1 && line.trim().startsWith('[')) {
      startIdx = i;
    }
    if (startIdx !== -1) {
      jsonStr += line + '\n';
      for (const ch of line) {
        if (ch === '[') bracketCount++;
        else if (ch === ']') bracketCount--;
      }
      if (bracketCount === 0) {
        try {
          const parsed = JSON.parse(jsonStr.trim());
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].code) {
            return parsed.map(normalizeStockItem);
          }
        } catch { /* 重置继续 */ }
        startIdx = -1;
        bracketCount = 0;
        jsonStr = '';
      }
    }
  }

  throw new Error('无法从 AI 响应中解析推荐结果');
}

function normalizeStockItem(item: any): StockRecommendation {
  return {
    code: String(item.code || ''),
    name: String(item.name || ''),
    market: String(item.market || 'a'),
    industry: String(item.industry || ''),
    currentPrice: Number(item.currentPrice) || 0,
    currency: String(item.currency || '¥'),
    targetPrice: Number(item.targetPrice) || 0,
    upside: Number(item.upside) || 0,
    rating: (['strong_buy', 'buy', 'hold'].includes(item.rating) ? item.rating : 'hold') as StockRecommendation['rating'],
    riskLevel: String(item.riskLevel || '中'),
    reasons: Array.isArray(item.reasons) ? item.reasons.map(String) : [],
    highlights: String(item.highlights || ''),
  };
}

// ===== 组件 =====

function ChipSelect({ options, value, onChange, multi = false }: {
  options: { value: string; label: string; icon?: string; desc?: string; color?: string }[];
  value: string | string[];
  onChange: (v: any) => void;
  multi?: boolean;
}) {
  const isSelected = (v: string) => multi ? (value as string[]).includes(v) : value === v;
  const handleClick = (v: string) => {
    if (multi) {
      const arr = value as string[];
      onChange(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
    } else {
      onChange(v);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => handleClick(opt.value)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-all ${
            isSelected(opt.value)
              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 shadow-sm'
              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
        >
          {opt.icon && <span>{opt.icon}</span>}
          <span className="font-medium">{opt.label}</span>
          {opt.desc && <span className="hidden sm:inline text-xs opacity-60">· {opt.desc}</span>}
        </button>
      ))}
    </div>
  );
}

export default function AIStockPicker() {
  const [form, setForm] = useState<PickerForm>(loadForm);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConv, setCurrentConv] = useState<Conversation | null>(null);
  const [results, setResults] = useState<StockRecommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressText, setProgressText] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载会话列表（只加载 picker 类型）
  const loadConversations = useCallback(async () => {
    try {
      const res = await authFetch('/api/conversations?type=picker');
      const data = await res.json();
      setConversations(data);
      return data;
    } catch (e) {
      console.error('加载会话列表失败', e);
      return [];
    }
  }, []);

  useEffect(() => {
    loadConversations().then((data: Conversation[]) => {
      if (data.length > 0) {
        loadConversationResult(data[0]);
      }
    });
  }, []);

  // 轮询检查当前任务的进度
  useEffect(() => {
    if (!currentConv) return;
    const task = globalTasks.get(currentConv.id);
    if (!task || task.status !== 'running') return;

    pollRef.current = setInterval(() => {
      const t = globalTasks.get(currentConv.id);
      if (t && t.status === 'running') {
        setProgressText(t.progressText);
        if (t.results) setResults(t.results);
        if (t.error) setError(t.error);
      }
      if (t && t.status !== 'running') {
        if (pollRef.current) clearInterval(pollRef.current);
        loadConversations();
      }
    }, 500);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [currentConv, loadConversations]);

  // 页面卸载时任务继续在后台运行（globalTasks 不受组件生命周期影响）

  const updateForm = <K extends keyof PickerForm>(key: K, val: PickerForm[K]) => {
    setForm(prev => {
      const next = { ...prev, [key]: val };
      localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  // 创建新选股任务
  const handleSubmit = async () => {
    if (form.markets.length === 0) { setError('请至少选择一个市场'); return; }
    setError(null);
    setResults(null);
    setProgressText('');

    try {
      // 创建会话（标记为 picker 类型）
      const res = await authFetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'AI选股', type: 'picker' }),
      });
      const conv: Conversation = await res.json();
      setCurrentConv(conv);

      // 更新标题
      const title = `${BUDGET_OPTIONS.find(o => o.value === form.budget)?.label || ''} · ${HORIZON_OPTIONS.find(o => o.value === form.horizon)?.label || ''}`;
      await authFetch(`/api/conversations/${conv.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.slice(0, 20) }),
      });

      // 保存用户消息
      const query = buildQuery(form);
      await authFetch(`/api/conversations/${conv.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', content: query }),
      });

      loadConversations();

      // 后台执行任务
      runPickerTask(conv.id, query, (text) => {
        setProgressText(text);
        setTimeout(() => {
          progressRef.current?.scrollTo({ top: progressRef.current.scrollHeight });
        }, 0);
      }).then((recs) => {
        setResults(recs);
        loadConversations();
      }).catch((e) => {
        setError(e.message || '选股失败');
      });
    } catch (e: any) {
      setError(e.message || '创建任务失败');
    }
  };

  // 加载历史会话结果
  const loadConversationResult = async (conv: Conversation) => {
    setCurrentConv(conv);
    setResults(null);
    setProgressText('');
    setError(null);
    setHistoryLoading(true);

    // 检查是否有正在运行的任务
    const task = globalTasks.get(conv.id);
    if (task && task.status === 'running') {
      setProgressText(task.progressText);
      setHistoryLoading(false);
      return;
    }

    // 从数据库加载消息
    try {
      const res = await authFetch(`/api/conversations/${conv.id}/messages`);
      const messages = await res.json();
      const assistantMsg = messages.filter((m: any) => m.role === 'assistant').pop();
      if (assistantMsg?.content) {
        const recs = parseRecommendations(assistantMsg.content);
        setResults(recs);
        setProgressText(assistantMsg.content);
      }
    } catch (e) {
      console.error('加载历史结果失败', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  // 删除会话
  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await authFetch(`/api/conversations/${convId}`, { method: 'DELETE' });
      globalTasks.delete(convId);
      if (currentConv?.id === convId) {
        setCurrentConv(null);
        setResults(null);
        setProgressText('');
      }
      loadConversations();
    } catch (err) {
      console.error('删除失败', err);
    }
  };

  // 新建选股
  const handleNew = () => {
    setCurrentConv(null);
    setResults(null);
    setProgressText('');
    setError(null);
  };

  // 从流式文本中提取当前阶段
  const currentStage = (() => {
    if (!progressText) return '';
    if (progressText.includes('阶段 6') || progressText.includes('最终推荐')) return '阶段 6/6：生成最终推荐';
    if (progressText.includes('阶段 5') || progressText.includes('投资组合构建')) return '阶段 5/6：构建投资组合';
    if (progressText.includes('阶段 4') || progressText.includes('深度分析')) return '阶段 4/6：深度分析与评分';
    if (progressText.includes('阶段 3') || progressText.includes('股票池')) return '阶段 3/6：构建股票池';
    if (progressText.includes('阶段 2') || progressText.includes('市场新闻') || progressText.includes('行业分析')) return '阶段 2/6：市场与行业分析';
    if (progressText.includes('阶段 1') || progressText.includes('偏好')) return '阶段 1/6：提取投资偏好';
    return '正在初始化分析...';
  })();

  const isLoading = currentConv ? (globalTasks.get(currentConv.id)?.status === 'running') : false;

  return (
    <div className="h-[calc(100vh-4rem)] flex">
      {/* 左侧：历史记录 */}
      <div className={`fixed md:relative inset-y-0 left-0 z-30 md:z-auto transition-transform duration-300 w-56 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-gray-50 dark:bg-gray-800/50 rounded-l-2xl ${showHistory ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">选股历史</span>
          <div className="flex items-center gap-1">
            <button
              onClick={handleNew}
              className="px-2 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition"
            >
              + 新选股
            </button>
            <button
              onClick={() => setShowHistory(false)}
              className="md:hidden p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-xs">暂无选股记录</div>
          ) : (
            conversations.map(conv => {
              const task = globalTasks.get(conv.id);
              const isRunning = task?.status === 'running';
              return (
                <div
                  key={conv.id}
                  onClick={() => loadConversationResult(conv)}
                  className={`group px-3 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 flex items-center justify-between transition ${
                    currentConv?.id === conv.id ? 'bg-indigo-50 dark:bg-indigo-900/20 border-r-2 border-indigo-500' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-700 dark:text-gray-200 truncate">{conv.title}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] text-gray-400">{new Date(conv.updated_at).toLocaleDateString()}</span>
                      {isRunning && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 animate-pulse">执行中</span>
                      )}
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
              );
            })
          )}
        </div>
      </div>

      {/* 右侧：主区域 */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <div className="p-4 md:p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHistory(true)}
                className="md:hidden p-2 -ml-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">AI 智能选股</h2>
            </div>
            {currentConv && !isLoading && (
              <button
                onClick={handleNew}
                className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition"
              >
                + 新选股
              </button>
            )}
          </div>

      {/* 历史加载中 */}
      {historyLoading && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm border border-gray-100 dark:border-gray-800 text-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">正在加载选股结果...</p>
        </div>
      )}

      {/* 表单区域：只有在新选股时才显示 */}
      {!currentConv && !results && !historyLoading && (<>
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100 dark:border-gray-800 space-y-5">
        <p className="text-xs text-gray-400">填写你的投资条件，AI 将为你筛选最匹配的股票</p>

        {/* 投资金额 */}
        <div>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">投资预算（元）</h4>
          <select
            value={form.budget}
            onChange={e => updateForm('budget', e.target.value)}
            className="w-full sm:w-64 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-indigo-500 transition"
          >
            {BUDGET_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* 投资期限 */}
        <div>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">投资期限</h4>
          <ChipSelect options={HORIZON_OPTIONS} value={form.horizon} onChange={(v: string) => updateForm('horizon', v)} />
        </div>

        {/* 风险承受能力 */}
        <div>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">风险承受能力</h4>
          <div className="flex flex-wrap gap-3">
            {RISK_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => updateForm('risk', opt.value)}
                className={`flex-1 min-w-[140px] p-3 rounded-xl border-2 text-left transition-all ${
                  form.risk === opt.value
                    ? opt.color + ' border-opacity-100 shadow-sm'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span>{opt.icon}</span>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{opt.label}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* 偏好行业 */}
        <div>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">偏好行业 <span className="font-normal text-xs text-gray-400">（可多选）</span></h4>
          <ChipSelect options={INDUSTRY_OPTIONS} value={form.industries} onChange={(v: string[]) => updateForm('industries', v)} multi />
        </div>

        {/* 目标市场 */}
        <div>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">目标市场 <span className="font-normal text-xs text-gray-400">（可多选）</span></h4>
          <ChipSelect options={MARKET_OPTIONS} value={form.markets} onChange={(v: string[]) => updateForm('markets', v)} multi />
        </div>
      </div>

      {/* 提交按钮 */}
      <button
        onClick={handleSubmit}
        disabled={isLoading}
        className="w-full py-3.5 rounded-2xl text-sm font-semibold transition shadow-sm bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
      >
        开始 AI 智能选股
      </button>
      </>)}

      {/* 分析进度面板 */}
      {isLoading && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          {/* 阶段指示器 */}
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{currentStage}</span>
            </div>
            {/* 进度条 */}
            <div className="mt-2 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                style={{
                  width: currentStage.includes('阶段 6') ? '95%' :
                         currentStage.includes('阶段 5') ? '80%' :
                         currentStage.includes('阶段 4') ? '65%' :
                         currentStage.includes('阶段 3') ? '45%' :
                         currentStage.includes('阶段 2') ? '25%' :
                         currentStage.includes('阶段 1') ? '10%' : '2%'
                }}
              />
            </div>
          </div>
          {/* 流式文本 */}
          <div
            ref={progressRef}
            className="max-h-64 overflow-y-auto p-4 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono leading-relaxed"
          >
            {progressText || '正在启动分析...'}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl p-4 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* 推荐结果 */}
      {results && results.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            为你精选 {results.length} 只股票
          </h3>
          {results.map((stock, i) => {
            const ratingStyle = RATING_STYLES[stock.rating] ?? RATING_STYLES.hold;
            return (
              <div key={stock.code} className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
                {/* 头部 */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-sm font-bold text-indigo-600 dark:text-indigo-400">
                      {i + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-white">{stock.name}</span>
                        <span className="text-xs text-gray-400">{stock.code}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">{stock.industry}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{stock.highlights}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium ${ratingStyle.color}`}>
                    {ratingStyle.text}
                  </span>
                </div>

                {/* 价格信息 */}
                <div className="flex flex-wrap items-center gap-3 md:gap-6 mb-3 py-2.5 px-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                  <div>
                    <p className="text-xs text-gray-400">当前价</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{stock.currency}{stock.currentPrice}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">目标价</p>
                    <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{stock.currency}{stock.targetPrice}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">预期涨幅</p>
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">+{stock.upside}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">风险等级</p>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{stock.riskLevel}</p>
                  </div>
                </div>

                {/* 推荐理由 */}
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">推荐理由</p>
                  <ul className="space-y-1">
                    {stock.reasons.map((reason, ri) => (
                      <li key={ri} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <span className="text-indigo-400 mt-0.5 shrink-0">•</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {results && results.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          暂无符合条件的推荐，请尝试调整筛选条件
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
