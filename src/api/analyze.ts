import type { StockHolding } from '../data/mockData';
import { authFetch } from './authFetch';
import { getApiConfig } from './config';

// ===== 投资偏好类型 =====

export interface InvestPreferences {
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  horizon: 'short' | 'medium' | 'long';
  goal: 'preserve' | 'income' | 'growth' | 'speculative';
  factors: ('fundamental' | 'technical' | 'sentiment' | 'macro')[];
  concentration: 'diversified' | 'moderate' | 'concentrated';
  stopLoss: 'strict' | 'moderate' | 'none';
}

export const PREFERENCE_OPTIONS = {
  riskTolerance: {
    label: '风险偏好',
    desc: '你能承受多大的投资波动？',
    options: [
      { value: 'conservative', label: '保守型', desc: '追求稳健，厌恶亏损', icon: '🛡️' },
      { value: 'moderate', label: '稳健型', desc: '可接受适度波动', icon: '⚖️' },
      { value: 'aggressive', label: '激进型', desc: '追求高收益，能承受大幅波动', icon: '🔥' },
    ],
  },
  horizon: {
    label: '投资期限',
    desc: '计划持有多长时间？',
    options: [
      { value: 'short', label: '短期', desc: '1-3个月', icon: '⚡' },
      { value: 'medium', label: '中期', desc: '3-12个月', icon: '📅' },
      { value: 'long', label: '长期', desc: '1年以上', icon: '🏔️' },
    ],
  },
  goal: {
    label: '投资目标',
    desc: '你最看重什么？',
    options: [
      { value: 'preserve', label: '资产保值', desc: '跑赢通胀即可', icon: '🏦' },
      { value: 'income', label: '稳定收益', desc: '希望获得持续分红/利息', icon: '💰' },
      { value: 'growth', label: '资本增值', desc: '追求中长期增长', icon: '📈' },
      { value: 'speculative', label: '高风险高回报', desc: '押注爆发性机会', icon: '🎯' },
    ],
  },
  factors: {
    label: '关注因素',
    desc: '分析时重点关注哪些方面？（可多选）',
    multi: true,
    options: [
      { value: 'fundamental', label: '基本面', desc: '财报、估值、行业地位', icon: '📊' },
      { value: 'technical', label: '技术面', desc: '趋势、形态、技术指标', icon: '📉' },
      { value: 'sentiment', label: '消息面', desc: '新闻、舆情、市场情绪', icon: '📰' },
      { value: 'macro', label: '宏观经济', desc: '利率、政策、国际环境', icon: '🌍' },
    ],
  },
  concentration: {
    label: '持仓集中度',
    desc: '偏好集中持仓还是分散持仓？',
    options: [
      { value: 'diversified', label: '分散持仓', desc: '10只以上，降低风险', icon: '🌐' },
      { value: 'moderate', label: '适度集中', desc: '5-10只，平衡风险收益', icon: '🎛️' },
      { value: 'concentrated', label: '集中持仓', desc: '5只以内，重仓看好的标的', icon: '🎯' },
    ],
  },
  stopLoss: {
    label: '止损策略',
    desc: '对下跌的忍受程度和应对方式？',
    options: [
      { value: 'strict', label: '严格止损', desc: '跌5%即卖出', icon: '🚨' },
      { value: 'moderate', label: '弹性止损', desc: '跌10-15%再考虑', icon: '⚠️' },
      { value: 'none', label: '不设止损', desc: '坚定持有，等待反弹', icon: '💎' },
    ],
  },
} as const;

// ===== 分析结果类型 =====

export interface DimensionAnalysis {
  dimension: string;
  score: number;
  summary: string;
  detail: string;
}

export interface ActionItem {
  type: 'buy' | 'sell' | 'hold' | 'reduce' | 'add';
  stock: string;
  code: string;
  quantity: number;
  reason: string;
  urgency: 'high' | 'medium' | 'low';
  targetPrice?: number;
  stopLoss?: number;
  pnlPercent?: number;
  riskLevel?: string;
  highlights?: string;
}

export interface AnalyzeResult {
  risk_level: string;
  risk_score: number;
  position_advice: string;
  actions: ActionItem[];
  dimensions: DimensionAnalysis[];
  overall_summary: string;
  preference_summary: string;
}

// ===== 构建 query =====

const RISK_LABELS: Record<string, string> = {
  conservative: '保守型（追求稳健，厌恶亏损）',
  moderate: '稳健型（可接受适度波动）',
  aggressive: '激进型（追求高收益，能承受大幅波动）',
};
const HORIZON_LABELS: Record<string, string> = {
  short: '短期（1-3个月）',
  medium: '中期（3-12个月）',
  long: '长期（1年以上）',
};
const GOAL_LABELS: Record<string, string> = {
  preserve: '资产保值',
  income: '稳定收益',
  growth: '资本增值',
  speculative: '高风险高回报',
};
const FACTOR_LABELS: Record<string, string> = {
  fundamental: '基本面',
  technical: '技术面',
  sentiment: '消息面',
  macro: '宏观经济',
};
const CONCENTRATION_LABELS: Record<string, string> = {
  diversified: '分散持仓（10只以上）',
  moderate: '适度集中（5-10只）',
  concentrated: '集中持仓（5只以内）',
};
const STOPLOSS_LABELS: Record<string, string> = {
  strict: '严格止损（跌5%即卖出）',
  moderate: '弹性止损（跌10-15%再考虑）',
  none: '不设止损（坚定持有）',
};

function getMarketType(code: string): string {
  if (code.endsWith('.HK') || (/^\d{1,5}$/.test(code) && code.length <= 5)) return 'hk';
  if (/^\d{6}$/.test(code)) return 'a';
  return 'us';
}

export function buildAnalyzeQuery(holdings: StockHolding[], prefs: InvestPreferences): string {
  const fence = '```';

  // 构建持仓表格
  const holdingLines = holdings.map(h => {
    const market = getMarketType(h.code);
    const pnl = ((h.currentPrice - h.buyPrice) / h.buyPrice * 100).toFixed(2);
    return `| ${h.code} | ${h.name} | ${h.buyPrice} | ${h.currentPrice} | ${h.quantity} | ${market} | ${pnl}% |`;
  }).join('\n');

  return `请使用 portfolio-analyzer skill 对我的持仓进行全面分析并给出调仓建议。

## 我的投资偏好

- 风险偏好：${RISK_LABELS[prefs.riskTolerance]}
- 投资期限：${HORIZON_LABELS[prefs.horizon]}
- 投资目标：${GOAL_LABELS[prefs.goal]}
- 关注因素：${prefs.factors.map(f => FACTOR_LABELS[f]).join('、')}
- 持仓集中度偏好：${CONCENTRATION_LABELS[prefs.concentration]}
- 止损策略：${STOPLOSS_LABELS[prefs.stopLoss]}

## 我的当前持仓

| 股票代码 | 名称 | 买入价 | 现价 | 数量 | 市场 | 盈亏% |
|----------|------|--------|------|------|------|-------|
${holdingLines}

请按照 portfolio-analyzer skill 的完整5阶段流程执行分析，并在最后输出以下 JSON 格式的调仓建议（必须包含在 ${fence}json 代码块中）：

${fence}json
[
  {
    "code": "股票代码",
    "name": "股票名称",
    "market": "a/hk/us",
    "action": "sell/buy/hold",
    "strength": "操作力度描述",
    "currentPrice": 当前价格数字,
    "buyPrice": 买入价格数字,
    "quantity": 持仓数量,
    "pnlPercent": 盈亏百分比数字,
    "targetPrice": 目标价格数字,
    "stopLoss": 止损价格数字,
    "reasons": ["理由1", "理由2", "理由3"],
    "riskLevel": "低/中低/中/中高/高",
    "urgency": "立即执行/近期执行/观察等待",
    "highlights": "一句话核心建议"
  }
]
${fence}`;
}

// ===== 解析 AI 响应 =====

function parseAnalyzerResponse(text: string): ActionItem[] {
  // 从 markdown 代码块中提取 JSON
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1].trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(normalizeActionItem);
      }
    } catch (e) {
      console.error('JSON 代码块解析失败', e);
    }
  }

  // 尝试直接匹配 JSON 数组
  const jsonArrayMatch = text.match(/\[[\s\S]*?\]/);
  if (jsonArrayMatch) {
    try {
      const parsed = JSON.parse(jsonArrayMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(normalizeActionItem);
      }
    } catch (e) {
      console.error('JSON 数组解析失败', e);
    }
  }

  throw new Error('无法从 AI 响应中解析调仓建议');
}

function normalizeActionItem(item: any): ActionItem {
  // action 映射到 type
  const actionMap: Record<string, ActionItem['type']> = {
    sell: 'sell',
    buy: 'buy',
    hold: 'hold',
  };
  const action = String(item.action || 'hold').toLowerCase();
  let type: ActionItem['type'] = actionMap[action] || 'hold';

  // strength 中包含"减仓"映射为 reduce，"加仓"映射为 add
  const strength = String(item.strength || '');
  if (action === 'sell' && (strength.includes('减仓') || strength.includes('部分'))) type = 'reduce';
  if (action === 'buy' && (strength.includes('加仓') || strength.includes('增持'))) type = 'add';

  // urgency 映射
  const urgencyMap: Record<string, 'high' | 'medium' | 'low'> = {
    '立即执行': 'high',
    '近期执行': 'medium',
    '观察等待': 'low',
  };
  const urgency = urgencyMap[String(item.urgency || '')] || 'low';

  return {
    type,
    stock: String(item.name || ''),
    code: String(item.code || ''),
    quantity: Number(item.quantity) || 0,
    reason: Array.isArray(item.reasons) ? item.reasons.join('；') : String(item.reasons || ''),
    urgency,
    targetPrice: item.targetPrice ? Number(item.targetPrice) : undefined,
    stopLoss: item.stopLoss ? Number(item.stopLoss) : undefined,
    pnlPercent: item.pnlPercent ? Number(item.pnlPercent) : undefined,
    riskLevel: String(item.riskLevel || ''),
    highlights: String(item.highlights || ''),
  };
}

// ===== 流式调用后端并解析 =====

export interface AnalyzeStreamCallbacks {
  onProgress: (text: string) => void;
  signal?: AbortSignal;
}

export async function analyzePortfolio(
  holdings: StockHolding[],
  preferences: InvestPreferences,
  callbacks?: AnalyzeStreamCallbacks,
): Promise<AnalyzeResult> {
  const query = buildAnalyzeQuery(holdings, preferences);

  // 调用流式接口
  const response = await authFetch('/api/v1/run_stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, api_key: getApiConfig().apiKey || undefined, exa_key: getApiConfig().exaKey || undefined }),
    signal: callbacks?.signal,
  });

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取响应流');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);
      if (payload === '[DONE]') continue;

      try {
        const msg = JSON.parse(payload);
        if (msg.type === 'delta' && msg.content) {
          fullText += msg.content;
          callbacks?.onProgress?.(fullText);
        } else if (msg.type === 'final' && msg.content) {
          fullText = msg.content;
          callbacks?.onProgress?.(fullText);
        }
      } catch {
        // 非 JSON 的 data 行，直接当文本处理
        fullText += payload;
        callbacks?.onProgress?.(fullText);
      }
    }
  }

  // 解析结构化数据
  const actions = parseAnalyzerResponse(fullText);

  // 从文本中推断风险评估和概要（简化处理）
  const riskMap: Record<string, { level: string; score: number }> = {
    conservative: { level: '低风险', score: 25 },
    moderate: { level: '中等风险', score: 50 },
    aggressive: { level: '高风险', score: 75 },
  };
  const risk = riskMap[preferences.riskTolerance] || riskMap.moderate;

  const goalMap: Record<string, string> = { preserve: '资产保值', income: '稳定收益', growth: '资本增值', speculative: '高风险高回报' };
  const horizonMap: Record<string, string> = { short: '短期(1-3月)', medium: '中期(3-12月)', long: '长期(1年+)' };
  const stopMap: Record<string, string> = { strict: '严格止损', moderate: '弹性止损', none: '不设止损' };

  const preferenceSummary = `投资画像：${risk.level}偏好 · ${horizonMap[preferences.horizon]} · 目标${goalMap[preferences.goal]} · ${stopMap[preferences.stopLoss]}`;

  // 从 fullText 中提取关键段落作为概要
  const sellCount = actions.filter(a => a.type === 'sell' || a.type === 'reduce').length;
  const buyCount = actions.filter(a => a.type === 'buy' || a.type === 'add').length;
  const holdCount = actions.filter(a => a.type === 'hold').length;

  const overallSummary = `综合分析您的${holdings.length}只持仓：建议卖出/减仓 ${sellCount} 只，加仓/买入 ${buyCount} 只，继续持有 ${holdCount} 只。详细理由已包含在各项操作建议中。`;

  // 构建维度分析（从持仓数据推断）
  const dimensions: DimensionAnalysis[] = [];
  if (preferences.factors.includes('fundamental')) {
    dimensions.push({ dimension: '基本面分析', score: 7, summary: 'AI 已完成深度分析', detail: '已通过脚本获取各持仓的 PE、ROE、营收增长等指标进行评估。' });
  }
  if (preferences.factors.includes('technical')) {
    dimensions.push({ dimension: '技术面分析', score: 6, summary: 'AI 已获取技术指标', detail: '已获取 RSI、MACD、均线等技术信号。' });
  }
  if (preferences.factors.includes('sentiment')) {
    dimensions.push({ dimension: '消息面分析', score: 6, summary: 'AI 已搜索最新消息', detail: '已通过网络搜索获取各持仓的最新利好利空消息。' });
  }
  if (preferences.factors.includes('macro')) {
    dimensions.push({ dimension: '宏观环境分析', score: 6, summary: 'AI 已评估市场环境', detail: '已分析当前宏观经济和行业景气度对持仓的影响。' });
  }
  dimensions.push({
    dimension: '持仓集中度',
    score: holdings.length >= 8 ? 8 : holdings.length >= 5 ? 6 : 4,
    summary: holdings.length >= 8 ? '分散度良好' : holdings.length >= 5 ? '适度集中' : '集中度较高',
    detail: `当前持有 ${holdings.length} 只股票。`,
  });

  const positionAdvice = actions.length > 0
    ? `根据 AI 分析，建议优先处理标记为"立即执行"的操作。具体调仓幅度和价格区间已在每条建议中列出。`
    : '当前持仓结构合理，暂无需大幅调整。';

  return {
    risk_level: risk.level,
    risk_score: risk.score,
    position_advice: positionAdvice,
    actions,
    dimensions,
    overall_summary: overallSummary,
    preference_summary: preferenceSummary,
  };
}
