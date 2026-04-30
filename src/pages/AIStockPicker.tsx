import { useState } from 'react';

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

// ===== Mock 推荐函数 =====

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function mockRecommend(form: PickerForm): Promise<StockRecommendation[]> {
  await delay(2000);

  const pool: StockRecommendation[] = [
    {
      code: 'NVDA', name: '英伟达', market: 'us', industry: '半导体/AI', currentPrice: 135.6, currency: '$',
      targetPrice: 165, upside: 21.7, rating: 'strong_buy', riskLevel: '中高',
      reasons: ['AI算力需求持续爆发，数据中心GPU市占率超80%', 'H200/B100新品周期驱动收入加速增长', '毛利率维持70%+，盈利能力极强'],
      highlights: 'AI基础设施核心标的，长期成长确定性高',
    },
    {
      code: '600519', name: '贵州茅台', market: 'a', industry: '消费/白酒', currentPrice: 1520, currency: '¥',
      targetPrice: 1750, upside: 15.1, rating: 'buy', riskLevel: '低',
      reasons: ['品牌壁垒极高，提价能力强', '现金流充裕，分红率持续提升', '消费复苏背景下高端白酒需求回暖'],
      highlights: '防御性极强的核心资产，适合长期配置',
    },
    {
      code: 'AAPL', name: '苹果', market: 'us', industry: '科技/消费电子', currentPrice: 198.5, currency: '$',
      targetPrice: 230, upside: 15.9, rating: 'buy', riskLevel: '低',
      reasons: ['服务收入占比持续提升，毛利率改善', 'Apple Intelligence有望驱动换机潮', '生态粘性极强，用户基数超20亿'],
      highlights: '全球市值最大公司，攻守兼备',
    },
    {
      code: '09888', name: '百度集团-W', market: 'hk', industry: '科技/AI', currentPrice: 95.4, currency: 'HK$',
      targetPrice: 130, upside: 36.3, rating: 'strong_buy', riskLevel: '中',
      reasons: ['文心大模型商业化加速，日均调用量超10亿次', '自动驾驶萝卜快跑进入商业化拐点', '当前估值处于历史低位，安全边际高'],
      highlights: '国内AI龙头，估值修复空间大',
    },
    {
      code: '300750', name: '宁德时代', market: 'a', industry: '新能源/制造', currentPrice: 195, currency: '¥',
      targetPrice: 245, upside: 25.6, rating: 'buy', riskLevel: '中',
      reasons: ['全球动力电池市占率第一(37%)', '麒麟电池/神行电池技术领先', '海外产能扩张打开增量空间'],
      highlights: '新能源赛道绝对龙头，技术护城河深',
    },
    {
      code: 'MSFT', name: '微软', market: 'us', industry: '科技/云计算', currentPrice: 430, currency: '$',
      targetPrice: 500, upside: 16.3, rating: 'buy', riskLevel: '低',
      reasons: ['Azure云增速重新加速至30%+', 'Copilot AI产品矩阵全面铺开', '企业级市场壁垒极深，经常性收入占比高'],
      highlights: 'AI+云计算双轮驱动，确定性极高',
    },
    {
      code: '00700', name: '腾讯控股', market: 'hk', industry: '科技/互联网', currentPrice: 388, currency: 'HK$',
      targetPrice: 470, upside: 21.1, rating: 'strong_buy', riskLevel: '中低',
      reasons: ['游戏业务复苏+海外拓展加速', '视频号商业化释放广告增量', '回购力度加大，股东回报提升'],
      highlights: '中国互联网龙头，商业模式优秀',
    },
    {
      code: '002594', name: '比亚迪', market: 'a', industry: '新能源汽车', currentPrice: 285, currency: '¥',
      targetPrice: 350, upside: 22.8, rating: 'buy', riskLevel: '中',
      reasons: ['新能源汽车销量持续高增长', '智能驾驶"天神之眼"技术快速迭代', '出海战略加速，全球市场份额提升'],
      highlights: '新能源汽车全产业链龙头',
    },
    {
      code: 'AMZN', name: '亚马逊', market: 'us', industry: '科技/电商/云', currentPrice: 186, currency: '$',
      targetPrice: 220, upside: 18.3, rating: 'buy', riskLevel: '低中',
      reasons: ['AWS云服务增速回升，AI推理需求拉动', '零售业务利润率持续改善', '广告业务成为第三增长曲线'],
      highlights: '全球电商+云计算双巨头',
    },
    {
      code: '601899', name: '紫金矿业', market: 'a', industry: '能源/有色金属', currentPrice: 16.5, currency: '¥',
      targetPrice: 20, upside: 21.2, rating: 'buy', riskLevel: '中高',
      reasons: ['铜金价格处于上行周期', '全球矿产资源储量持续扩张', '成本控制优秀，盈利弹性大'],
      highlights: '黄金+铜双主线，受益于通胀预期',
    },
  ];

  // 根据表单筛选
  let filtered = pool;

  // 市场筛选
  if (form.markets.length > 0) {
    filtered = filtered.filter(s => form.markets.includes(s.market));
  }

  // 风险筛选：低风险用户不推高风险股
  if (form.risk === 'low') {
    filtered = filtered.filter(s => s.riskLevel === '低' || s.riskLevel === '低中');
  }

  // 投资期限影响推荐排序
  if (form.horizon === 'ultra_short' || form.horizon === 'short') {
    filtered.sort((a, b) => b.upside - a.upside);
  }

  // 取前5只
  return filtered.slice(0, 5);
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
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<StockRecommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateForm = <K extends keyof PickerForm>(key: K, val: PickerForm[K]) => {
    setForm(prev => {
      const next = { ...prev, [key]: val };
      localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleSubmit = async () => {
    if (form.markets.length === 0) { setError('请至少选择一个市场'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await mockRecommend(form);
      setResults(res);
    } catch (e: any) {
      setError(e.message || '推荐请求失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">AI 智能选股</h2>

      {/* 表单区域 */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 space-y-5">
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
        disabled={loading}
        className={`w-full py-3.5 rounded-2xl text-sm font-semibold transition shadow-sm ${
          loading
            ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600 hover:shadow-md'
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            AI 正在分析筛选...
          </span>
        ) : results ? '重新选股' : '开始 AI 智能选股'}
      </button>

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
                <div className="flex items-center gap-6 mb-3 py-2.5 px-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
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
  );
}
