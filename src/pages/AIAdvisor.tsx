import { useState, useEffect } from 'react';
import { useStocks } from '../context/StockContext';
import { analyzePortfolio, PREFERENCE_OPTIONS, type InvestPreferences, type AnalyzeResult } from '../api/analyze';

const PREFS_STORAGE_KEY = 'ai_invest_preferences';

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
  '低风险': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  '中等风险': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400',
  '高风险': 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400',
};

const DEFAULT_PREFS: InvestPreferences = {
  riskTolerance: 'moderate',
  horizon: 'medium',
  goal: 'growth',
  factors: ['fundamental', 'macro'],
  concentration: 'moderate',
  stopLoss: 'moderate',
};

function loadPrefs(): InvestPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PREFS;
}

function savePrefs(prefs: InvestPreferences) {
  localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
}

// 偏好摘要标签
function prefLabel(key: string, value: string): string {
  const group = (PREFERENCE_OPTIONS as any)[key];
  if (!group) return value;
  const opt = group.options.find((o: any) => o.value === value);
  return opt ? `${opt.icon} ${opt.label}` : value;
}

// 单选偏好组件
function PreferenceGroup({ label, desc, options, value, onChange }: {
  label: string;
  desc: string;
  options: readonly { value: string; label: string; desc: string; icon: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-2">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</h4>
        <p className="text-xs text-gray-400">{desc}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
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

// 多选偏好组件
function MultiPreferenceGroup({ label, desc, options, values, onChange }: {
  label: string;
  desc: string;
  options: readonly { value: string; label: string; desc: string; icon: string }[];
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (val: string) => {
    onChange(values.includes(val) ? values.filter(v => v !== val) : [...values, val]);
  };

  return (
    <div>
      <div className="mb-2">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</h4>
        <p className="text-xs text-gray-400">{desc}</p>
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

  // 偏好变化时持久化
  useEffect(() => { savePrefs(prefs); }, [prefs]);

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
    setShowPrefs(false);
    try {
      const res = await analyzePortfolio(holdings, prefs);
      setResult(res);
    } catch (e: any) {
      setError(e.message || '分析请求失败');
    } finally {
      setAnalyzing(false);
    }
  };

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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">AI 投资分析</h2>
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

      {/* 偏好设置面板（可折叠） */}
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
      <button
        onClick={handleAnalyze}
        disabled={analyzing || holdings.length === 0}
        className={`w-full py-3.5 rounded-2xl text-sm font-semibold transition shadow-sm ${
          analyzing || holdings.length === 0
            ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600 hover:shadow-md'
        }`}
      >
        {analyzing ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            AI 正在分析您的持仓...
          </span>
        ) : holdings.length === 0 ? '请先添加持仓股票' : result ? '重新分析' : '开始 AI 智能分析'}
      </button>

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
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">操作建议</h3>
            <div className="space-y-3">
              {result.actions.map((action, i) => {
                const actionStyle = ACTION_LABELS[action.type] ?? ACTION_LABELS.hold;
                const urgStyle = URGENCY_LABELS[action.urgency] ?? URGENCY_LABELS.low;
                return (
                  <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 flex items-start gap-4">
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
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{action.reason}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 总结 */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-500/5 dark:to-purple-500/5 rounded-2xl p-6 border border-indigo-100 dark:border-indigo-500/20">
            <h3 className="text-sm font-medium text-indigo-600 dark:text-indigo-400 mb-2">AI 分析总结</h3>
            <p className="text-gray-800 dark:text-gray-200 leading-relaxed text-sm">{result.overall_summary}</p>
          </div>
        </div>
      )}
    </div>
  );
}
