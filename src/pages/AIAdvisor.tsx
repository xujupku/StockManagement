import { useState, useEffect, useRef, useCallback } from 'react';
import { useStocks } from '../context/StockContext';
import { analyzePortfolio, PREFERENCE_OPTIONS, type InvestPreferences, type AnalyzeResult } from '../api/analyze';
import { authFetch } from '../api/authFetch';

const PREFS_STORAGE_KEY = 'ai_invest_preferences';
const CONV_TYPE = 'advisor';

const ACTION_LABELS: Record<string, { text: string; color: string }> = {
  buy: { text: '买入', color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  sell: { text: '卖出', color: 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
  hold: { text: '持有', color: 'bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' },
  reduce: { text: '减仓', color: 'bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400' },
  add: { text: '加仓', color: 'bg-teal-100 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400' },
};

const URGENCY_LABELS: Record<string, { text: string; color: string }> = {
  high: { text: '紧急', color: 'bg-red-50 text-red-500 dark:bg-red-500/10' },
  medium: { text: '建议', color: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-500/10' },
  low: { text: '可选', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800' },
};

const riskColors: Record<string, string> = {
  低: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  中: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400',
  高: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400',
};

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
}

function loadPrefs(): InvestPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {
      riskTolerance: 'moderate',
      horizon: 'medium',
      goal: 'growth',
      factors: ['fundamental', 'technical'],
      concentration: 'moderate',
      stopLoss: 'moderate',
    };
  } catch { return { riskTolerance: 'moderate', horizon: 'medium', goal: 'growth', factors: ['fundamental', 'technical'], concentration: 'moderate', stopLoss: 'moderate' }; }
}

function savePrefs(p: InvestPreferences) {
  localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(p));
}

function prefLabel(group: string, value: string): string {
  const opt = PREFERENCE_OPTIONS[group as keyof typeof PREFERENCE_OPTIONS]?.options?.find((o: any) => o.value === value);
  return opt?.label || value;
}

function detectStage(text: string): { step: number; label: string } {
  const stages = [
    { keywords: ['持仓概览', '健康度诊断', '阶段 1', '阶段1'], label: '持仓概览诊断' },
    { keywords: ['深度分析', '逐只', '阶段 2', '阶段2'], label: '持仓深度分析' },
    { keywords: ['行业', '市场环境', '阶段 3', '阶段3'], label: '行业与市场分析' },
    { keywords: ['调仓建议', '阶段 4', '阶段4'], label: '调仓建议生成' },
    { keywords: ['方案', '风险提示', '阶段 5', '阶段5'], label: '方案与风险提示' },
  ];
  for (let i = stages.length - 1; i >= 0; i--) {
    if (stages[i].keywords.some(k => text.includes(k))) {
      return { step: i + 1, label: stages[i].label };
    }
  }
  return { step: 0, label: '' };
}

// 解析历史消息中的分析结果
function parseAnalysisFromMessages(messages: Message[]): { userQuery: string; result: AnalyzeResult } | null {
  const userMsg = messages.find(m => m.role === 'user');
  const assistantMsg = messages.find(m => m.role === 'assistant');
  if (!userMsg || !assistantMsg) return null;

  // 尝试从 assistant 消息中提取 JSON
  try {
    const jsonMatch = assistantMsg.content.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      const actions = JSON.parse(jsonMatch[1]);
      const result: AnalyzeResult = {
        preference_summary: '历史分析',
        risk_level: '中',
        risk_score: 50,
        dimensions: [],
        position_advice: '',
        actions: actions.map((a: any) => ({
          type: a.action || 'hold',
          stock: a.name || a.code,
          code: a.code,
          quantity: a.quantity || 0,
          reason: a.reasons?.join('、') || a.reason || '',
          urgency: a.urgency === '立即执行' ? 'high' : a.urgency === '观察等待' ? 'low' : 'medium',
          targetPrice: a.targetPrice,
          stopLoss: a.stopLoss,
          pnlPercent: a.pnlPercent,
          riskLevel: a.riskLevel,
          highlights: a.highlights,
        })),
        overall_summary: '',
      };
      return { userQuery: userMsg.content, result };
    }
  } catch {}

  // 无法解析 JSON，构建一个简化结果
  return {
    userQuery: userMsg.content,
    result: {
      preference_summary: '历史分析',
      risk_level: '中',
      risk_score: 50,
      dimensions: [],
      position_advice: '',
      actions: [],
      overall_summary: assistantMsg.content.slice(0, 500) + (assistantMsg.content.length > 500 ? '...' : ''),
    },
  };
}

function PreferenceGroup({ label, desc, options, value, onChange }: {
  label: string; desc: string; options: readonly { value: string; label: string; icon: string }[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-2">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
        <span className="ml-2 text-xs text-gray-400">{desc}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-all ${
              value === opt.value
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 shadow-sm'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <span>{opt.icon}</span>
            <span className="font-medium">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MultiPreferenceGroup({ label, desc, options, values, onChange }: {
  label: string; desc: string; options: readonly { value: string; label: string; icon: string; desc: string }[]; values: string[]; onChange: (v: string[]) => void;
}) {
  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v]);
  };
  return (
    <div>
      <div className="mb-2">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
        <span className="ml-2 text-xs text-gray-400">{desc}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => {
          const selected = values.includes(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => toggle(opt.value)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-all ${
                selected
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 shadow-sm'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <span>{opt.icon}</span>
              <span className="font-medium">{opt.label}</span>
              <span className="hidden sm:inline text-xs opacity-60">· {opt.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AIAdvisor() {
  const { holdings } = useStocks();
  const [prefs, setPrefs] = useState<InvestPreferences>(loadPrefs);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [progressText, setProgressText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // 历史会话
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await authFetch(`/api/conversations?type=${CONV_TYPE}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
        return data;
      }
    } catch (e) {
      console.error('加载分析历史失败', e);
    }
    return [];
  }, []);

  useEffect(() => {
    loadHistory().then((data: Conversation[]) => {
      if (data.length > 0) {
        const latest = data[0];
        setCurrentConvId(latest.id);
        loadConversationMessages(latest.id);
      }
    });
  }, []);
  useEffect(() => { savePrefs(prefs); }, [prefs]);

  // 创建新会话
  const createNewConversation = async (): Promise<string> => {
    const res = await authFetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '新分析', type: CONV_TYPE }),
    });
    const data = await res.json();
    await loadHistory();
    return data.id;
  };

  // 加载历史会话消息
  const loadConversationMessages = async (convId: string) => {
    try {
      const res = await authFetch(`/api/conversations/${convId}/messages`);
      const messages: Message[] = await res.json();
      const parsed = parseAnalysisFromMessages(messages);
      if (parsed) {
        setResult(parsed.result);
        setError(null);
        setProgressText('');
      }
    } catch (e) {
      console.error('加载历史消息失败', e);
    }
  };

  // 保存用户查询和分析结果
  const saveAnalysisResult = async (convId: string, userQuery: string, analysisText: string) => {
    // 保存用户消息
    await authFetch(`/api/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'user', content: userQuery }),
    });
    // 保存 assistant 消息
    await authFetch(`/api/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'assistant', content: analysisText }),
    });
    // 更新会话标题
    const title = userQuery.slice(0, 20) + (userQuery.length > 20 ? '...' : '');
    await authFetch(`/api/conversations/${convId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    await loadHistory();
  };

  // 删除会话
  const deleteConversation = async (convId: string) => {
    await authFetch(`/api/conversations/${convId}`, { method: 'DELETE' });
    if (currentConvId === convId) {
      setCurrentConvId(null);
      setResult(null);
      setProgressText('');
    }
    await loadHistory();
  };

  const updatePref = <K extends keyof InvestPreferences>(key: K, value: InvestPreferences[K]) => {
    setPrefs(p => ({ ...p, [key]: value }));
  };

  const handleAnalyze = async () => {
    if (prefs.factors.length === 0) {
      setError('请至少选择一个关注因素');
      return;
    }
    setAnalyzing(true);
    setError(null);
    setResult(null);
    setShowPrefs(false);
    setProgressText('');

    // 创建新会话
    const convId = await createNewConversation();
    setCurrentConvId(convId);

    const controller = new AbortController();
    abortRef.current = controller;

    let fullText = '';

    try {
      const res = await analyzePortfolio(holdings, prefs, {
        onProgress: (text) => {
          fullText = text;
          setProgressText(text);
          setTimeout(() => {
            progressRef.current?.scrollTo({ top: progressRef.current.scrollHeight });
          }, 0);
        },
        signal: controller.signal,
      });
      setResult(res);
      // 保存分析结果
      await saveAnalysisResult(convId, buildUserQuery(), fullText);
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setProgressText(prev => prev + '\n\n[已停止分析]');
      } else {
        setError(e.message || '分析请求失败');
      }
    } finally {
      setAnalyzing(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const buildUserQuery = () => {
    const prefSummary = [
      `风险偏好: ${prefLabel('riskTolerance', prefs.riskTolerance)}`,
      `投资期限: ${prefLabel('horizon', prefs.horizon)}`,
      `投资目标: ${prefLabel('goal', prefs.goal)}`,
      `关注因素: ${prefs.factors.map(f => prefLabel('factors', f)).join('、')}`,
      `集中度偏好: ${prefLabel('concentration', prefs.concentration)}`,
      `止损策略: ${prefLabel('stopLoss', prefs.stopLoss)}`,
    ].join('\n');
    return `持仓分析请求\n${prefSummary}\n\n当前持仓: ${holdings.map(h => `${h.code}(${h.name})`).join(', ')}`;
  };

  // 当前阶段检测
  const stage = detectStage(progressText);
  const progressPercent = Math.min((stage.step / 5) * 100, 100);

  // 当前偏好摘要标签列表
  const prefTags = [
    prefLabel('riskTolerance', prefs.riskTolerance),
    prefLabel('horizon', prefs.horizon),
    prefLabel('goal', prefs.goal),
    ...prefs.factors.map(f => prefLabel('factors', f)),
    prefLabel('concentration', prefs.concentration),
    prefLabel('stopLoss', prefs.stopLoss),
  ];

  return (
    <div className="flex h-full">
      {/* 左侧：历史列表 */}
      <div className={`w-64 shrink-0 fixed md:relative inset-y-0 left-0 z-30 md:z-auto transition-transform duration-300 h-full border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col ${showHistory ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <span className="font-semibold text-gray-900 dark:text-white text-sm">分析历史</span>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setCurrentConvId(null);
                setResult(null);
                setProgressText('');
                setError(null);
                setShowHistory(false);
              }}
              className="text-xs px-2 py-1 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition"
            >
              + 新分析
            </button>
            <button
              onClick={() => setShowHistory(false)}
              className="md:hidden p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-gray-400">暂无历史记录</div>
          ) : (
            <div className="py-2">
              {conversations.map(conv => (
                <div
                  key={conv.id}
                  className={`group px-4 py-3 cursor-pointer transition relative ${
                    currentConvId === conv.id
                      ? 'bg-indigo-50 dark:bg-indigo-500/10'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-900'
                  }`}
                  onClick={() => {
                    setCurrentConvId(conv.id);
                    loadConversationMessages(conv.id);
                    setShowHistory(false);
                  }}
                >
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate pr-6">
                    {conv.title}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(conv.updated_at).toLocaleDateString()}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-400 transition"
                    title="删除"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 右侧：主内容 */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* 标题栏 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHistory(true)}
                className="md:hidden p-2 -ml-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                title="打开历史记录"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">AI 持仓分析</h2>
            </div>
            <button
              onClick={() => setShowPrefs(s => !s)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              title="修改投资偏好"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              偏好设置
            </button>
          </div>

          {/* 当前偏好摘要标签 */}
          <div className="flex flex-wrap items-center gap-1.5">
            {prefTags.map((tag, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{tag}</span>
            ))}
          </div>

          {/* 偏好设置面板 */}
          {showPrefs && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">投资偏好设置</h3>
                  <p className="text-xs text-gray-400 mt-1">修改后自动保存，下次进入页面将沿用当前偏好</p>
                </div>
                <button onClick={() => setShowPrefs(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-800 pt-5 space-y-5">
                <PreferenceGroup
                  label={PREFERENCE_OPTIONS.riskTolerance.label}
                  desc={PREFERENCE_OPTIONS.riskTolerance.desc}
                  options={PREFERENCE_OPTIONS.riskTolerance.options}
                  value={prefs.riskTolerance}
                  onChange={v => updatePref('riskTolerance', v as InvestPreferences['riskTolerance'])}
                />
                <PreferenceGroup
                  label={PREFERENCE_OPTIONS.horizon.label}
                  desc={PREFERENCE_OPTIONS.horizon.desc}
                  options={PREFERENCE_OPTIONS.horizon.options}
                  value={prefs.horizon}
                  onChange={v => updatePref('horizon', v as InvestPreferences['horizon'])}
                />
                <PreferenceGroup
                  label={PREFERENCE_OPTIONS.goal.label}
                  desc={PREFERENCE_OPTIONS.goal.desc}
                  options={PREFERENCE_OPTIONS.goal.options}
                  value={prefs.goal}
                  onChange={v => updatePref('goal', v as InvestPreferences['goal'])}
                />
                <MultiPreferenceGroup
                  label={PREFERENCE_OPTIONS.factors.label}
                  desc={PREFERENCE_OPTIONS.factors.desc}
                  options={PREFERENCE_OPTIONS.factors.options}
                  values={prefs.factors}
                  onChange={v => updatePref('factors', v as InvestPreferences['factors'])}
                />
                <PreferenceGroup
                  label={PREFERENCE_OPTIONS.concentration.label}
                  desc={PREFERENCE_OPTIONS.concentration.desc}
                  options={PREFERENCE_OPTIONS.concentration.options}
                  value={prefs.concentration}
                  onChange={v => updatePref('concentration', v as InvestPreferences['concentration'])}
                />
                <PreferenceGroup
                  label={PREFERENCE_OPTIONS.stopLoss.label}
                  desc={PREFERENCE_OPTIONS.stopLoss.desc}
                  options={PREFERENCE_OPTIONS.stopLoss.options}
                  value={prefs.stopLoss}
                  onChange={v => updatePref('stopLoss', v as InvestPreferences['stopLoss'])}
                />
              </div>
            </div>
          )}

          {/* 主操作按钮 */}
          {!analyzing ? (
            <button
              onClick={handleAnalyze}
              disabled={holdings.length === 0}
              className={`w-full py-3.5 rounded-2xl text-sm font-semibold transition shadow-sm ${
                holdings.length === 0
                  ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600 hover:shadow-md'
              }`}
            >
              {holdings.length === 0 ? '请先添加持仓股票' : result ? '重新分析' : '开始 AI 智能分析'}
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold transition shadow-sm bg-red-500 text-white hover:bg-red-600"
            >
              停止分析
            </button>
          )}

          {/* 进度面板 */}
          {analyzing && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                  {stage.step > 0 ? `阶段 ${stage.step}/5：${stage.label}` : '正在启动分析...'}
                </span>
                <span className="text-xs text-gray-400">{Math.round(progressPercent)}%</span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(progressPercent, 5)}%`,
                    background: 'linear-gradient(90deg, #6366f1, #a855f7)',
                  }}
                />
              </div>
              <div
                ref={progressRef}
                className="max-h-64 overflow-y-auto bg-gray-50 dark:bg-gray-950 rounded-xl p-3 text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap leading-relaxed"
              >
                {progressText || '等待 AI 响应...'}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl p-4 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* 分析结果 */}
          {result && (
            <div className="space-y-6">
              {/* 投资画像标签 */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-500/5 dark:to-purple-500/5 rounded-2xl p-4 border border-indigo-100 dark:border-indigo-500/20">
                <p className="text-sm text-indigo-700 dark:text-indigo-300 font-medium">{result.preference_summary}</p>
              </div>

              {/* 风险评估 */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">持仓风险评估</h3>
                  <span className={`ml-auto px-3 py-1 rounded-full text-xs font-medium ${riskColors[result.risk_level] ?? 'bg-gray-100 text-gray-600'}`}>
                    {result.risk_level} · {result.risk_score}分
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${result.risk_score}%`,
                        background: 'linear-gradient(90deg, #10b981, #f59e0b, #ef4444)',
                      }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-12 text-right">{result.risk_score}/100</span>
                </div>
              </div>

              {/* 多维度分析 */}
              {result.dimensions.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">多维度分析</h3>
                  <div className="space-y-4">
                    {result.dimensions.map((dim, i) => (
                      <div key={i} className="border-b border-gray-50 dark:border-gray-800 pb-4 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{dim.dimension}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">{dim.summary}</span>
                            <span className={`text-xs font-bold ${dim.score >= 7 ? 'text-emerald-500' : dim.score >= 4 ? 'text-yellow-500' : 'text-red-500'}`}>
                              {dim.score}/10
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mb-2">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              dim.score >= 7 ? 'bg-emerald-500' : dim.score >= 4 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${dim.score * 10}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{dim.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 仓位建议 */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">仓位建议</h3>
                <p className="text-gray-800 dark:text-gray-200 leading-relaxed text-sm">{result.position_advice}</p>
              </div>

              {/* 操作建议 */}
              {result.actions.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">操作建议</h3>
                  <div className="space-y-3">
                    {result.actions.map((action, i) => {
                      const actionStyle = ACTION_LABELS[action.type] ?? ACTION_LABELS.hold;
                      const urgStyle = URGENCY_LABELS[action.urgency] ?? URGENCY_LABELS.low;
                      return (
                        <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
                          <div className="flex flex-col sm:flex-row items-start gap-4">
                            <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold ${actionStyle.color}`}>
                              {actionStyle.text}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-gray-900 dark:text-white">{action.stock}</span>
                                <span className="text-xs text-gray-400">{action.code}</span>
                                {action.quantity > 0 && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                                    {action.quantity}股
                                  </span>
                                )}
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${urgStyle.color}`}>
                                  {urgStyle.text}
                                </span>
                                {action.riskLevel && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-500">
                                    风险:{action.riskLevel}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{action.reason}</p>
                              {(action.targetPrice || action.stopLoss || action.pnlPercent !== undefined) && (
                                <div className="flex flex-wrap gap-3 mt-2 text-xs">
                                  {action.pnlPercent !== undefined && (
                                    <span className={action.pnlPercent >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                                      盈亏: {action.pnlPercent > 0 ? '+' : ''}{action.pnlPercent.toFixed(1)}%
                                    </span>
                                  )}
                                  {action.targetPrice && (
                                    <span className="text-indigo-500">目标价: {action.targetPrice}</span>
                                  )}
                                  {action.stopLoss && (
                                    <span className="text-orange-500">止损: {action.stopLoss}</span>
                                  )}
                                </div>
                              )}
                              {action.highlights && (
                                <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1 font-medium">{action.highlights}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 总结 */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-500/5 dark:to-purple-500/5 rounded-2xl p-6 border border-indigo-100 dark:border-indigo-500/20">
                <h3 className="text-sm font-medium text-indigo-600 dark:text-indigo-400 mb-2">AI 分析总结</h3>
                <p className="text-gray-800 dark:text-gray-200 leading-relaxed text-sm">{result.overall_summary}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
