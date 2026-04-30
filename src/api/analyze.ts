import type { StockHolding } from '../data/mockData';

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

// ===== Mock 分析函数 =====

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function analyzePortfolio(
  holdings: StockHolding[],
  preferences: InvestPreferences,
): Promise<AnalyzeResult> {
  // 模拟网络延迟
  await delay(2000);

  const riskMap = { conservative: 25, moderate: 50, aggressive: 78 };
  const riskLabelMap = { conservative: '低风险', moderate: '中等风险', aggressive: '高风险' };
  const goalMap = { preserve: '资产保值', income: '稳定收益', growth: '资本增值', speculative: '高风险高回报' };
  const horizonMap = { short: '短期(1-3月)', medium: '中期(3-12月)', long: '长期(1年+)' };

  const riskScore = riskMap[preferences.riskTolerance];
  const riskLevel = riskLabelMap[preferences.riskTolerance];

  // 根据偏好生成不同的分析维度
  const dimensions: DimensionAnalysis[] = [];

  if (preferences.factors.includes('fundamental')) {
    dimensions.push({
      dimension: '基本面分析',
      score: preferences.riskTolerance === 'conservative' ? 8 : 6,
      summary: '整体质量良好',
      detail: `持仓${holdings.length}只股票中，多数为各行业龙头。${
        preferences.goal === 'income' ? '建议关注分红率较高的标的，如茅台。' : '成长性较好，估值处于合理区间。'
      }`,
    });
  }
  if (preferences.factors.includes('technical')) {
    dimensions.push({
      dimension: '技术面分析',
      score: 5,
      summary: '信号偏中性',
      detail: `从均线系统看，部分持仓处于上升通道。${
        preferences.horizon === 'short' ? '短期内MACD出现金叉的有2只。' : '中长期趋势向好，建议耐心持有。'
      }`,
    });
  }
  if (preferences.factors.includes('sentiment')) {
    dimensions.push({
      dimension: '消息面分析',
      score: 7,
      summary: '情绪偏正面',
      detail: '近期科技板块受AI利好提振，市场情绪回暖。建议关注即将发布财报的个股，可能带来波动机会。',
    });
  }
  if (preferences.factors.includes('macro')) {
    dimensions.push({
      dimension: '宏观环境分析',
      score: 6,
      summary: '环境中性偏正',
      detail: `当前利率环境${preferences.horizon === 'short' ? '对短期交易影响有限' : '对长期持有价值股有利'}。人民币汇率波动可能影响海外资产的人民币计价表现。`,
    });
  }

  // 集中度分析总是包含
  dimensions.push({
    dimension: '持仓集中度',
    score: preferences.concentration === 'diversified' ? 8 : preferences.concentration === 'moderate' ? 6 : 4,
    summary: holdings.length >= 8 ? '分散度良好' : holdings.length >= 5 ? '适度集中' : '过度集中',
    detail: `当前持有${holdings.length}只股票。${
      preferences.concentration === 'diversified' && holdings.length < 10
        ? '根据您的分散持仓偏好，建议增加持仓只数至10只以上。'
        : preferences.concentration === 'concentrated' && holdings.length > 5
        ? '根据您的集中持仓偏好，建议精选3-5只重仓标的。'
        : '与您的持仓集中度偏好匹配。'
    }`,
  });

  // 根据偏好生成操作建议
  const actions: ActionItem[] = [];

  if (preferences.riskTolerance === 'conservative') {
    actions.push(
      { type: 'reduce', stock: '特斯拉', code: 'TSLA', quantity: 20, reason: '波动率过高，不符合保守型策略，建议减仓或清仓', urgency: 'high' },
      { type: 'buy', stock: '沪深300ETF', code: '510300', quantity: 200, reason: '增加宽基指数配置，降低组合波动率', urgency: 'medium' },
      { type: 'hold', stock: '茅台', code: '600519', quantity: 0, reason: '现金流稳定、分红率高，适合保守策略长期持有', urgency: 'low' },
    );
  } else if (preferences.riskTolerance === 'aggressive') {
    actions.push(
      { type: 'add', stock: '英伟达', code: 'NVDA', quantity: 15, reason: 'AI芯片龙头，增长确定性高，建议加仓', urgency: 'high' },
      { type: 'buy', stock: 'Meta', code: 'META', quantity: 20, reason: 'AI广告变现潜力巨大，估值尚有空间', urgency: 'medium' },
      { type: 'sell', stock: '茅台', code: '600519', quantity: 3, reason: '增长放缓，资金效率不足，释放资金追求更高收益', urgency: 'medium' },
    );
  } else {
    actions.push(
      { type: 'hold', stock: '苹果', code: 'AAPL', quantity: 0, reason: '基本面强劲，估值合理，符合稳健增长策略', urgency: 'low' },
      { type: 'reduce', stock: '特斯拉', code: 'TSLA', quantity: 10, reason: '短期估值偏高，建议适度减仓锁定利润', urgency: 'medium' },
      { type: 'buy', stock: '强生', code: 'JNJ', quantity: 30, reason: '医疗板块防御性强，增加组合稳定性', urgency: 'medium' },
    );
  }

  // 止损策略影响
  if (preferences.stopLoss === 'strict') {
    const losers = holdings.filter(h => h.currentPrice < h.buyPrice);
    losers.forEach(h => {
      const lossPct = ((h.currentPrice - h.buyPrice) / h.buyPrice) * 100;
      if (lossPct < -5 && !actions.some(a => a.code === h.code)) {
        actions.push({
          type: 'sell', stock: h.name, code: h.code, quantity: h.quantity,
          reason: `当前亏损${lossPct.toFixed(1)}%，已触及严格止损线(-5%)，建议止损`, urgency: 'high',
        });
      }
    });
  }

  const positionAdvice = preferences.riskTolerance === 'conservative'
    ? `基于您的保守型偏好和${horizonMap[preferences.horizon]}投资期限，建议股票仓位不超过50%，增加债券和货币基金配置。单只股票仓位控制在10%以内。`
    : preferences.riskTolerance === 'aggressive'
    ? `基于您的激进型偏好，建议集中持仓高成长性标的。${preferences.horizon === 'short' ? '短期可适当提高换手率，捕捉波段机会。' : '建议重仓长期看好的赛道龙头，耐心持有。'}`
    : `基于您的稳健型偏好和${goalMap[preferences.goal]}目标，建议维持60-70%股票仓位，行业适度分散。${preferences.factors.includes('fundamental') ? '重点关注财报季的基本面变化。' : ''}`;

  const preferenceSummary = `投资画像：${riskLevel}偏好 · ${horizonMap[preferences.horizon]} · 目标${goalMap[preferences.goal]} · ${
    preferences.stopLoss === 'strict' ? '严格止损' : preferences.stopLoss === 'moderate' ? '弹性止损' : '不设止损'
  }`;

  const overallSummary = `综合您的${holdings.length}只持仓和投资偏好分析：${
    preferences.riskTolerance === 'conservative'
      ? '当前组合波动率偏高，建议通过增加防御性资产来降低整体风险。重点关注高分红、低估值的蓝筹股。'
      : preferences.riskTolerance === 'aggressive'
      ? '当前组合具备较好的成长性，但科技板块集中度较高。建议把握AI主线，同时注意分批建仓控制成本。'
      : '当前组合结构合理，科技股占比略高。建议适当增加消费、医疗等防御性板块，使组合更加均衡。'
  }${preferences.stopLoss === 'strict' ? ' 已根据您的严格止损策略标记了需要关注的亏损头寸。' : ''}`;

  return {
    risk_level: riskLevel,
    risk_score: riskScore,
    position_advice: positionAdvice,
    actions,
    dimensions,
    overall_summary: overallSummary,
    preference_summary: preferenceSummary,
  };
}
