export interface StockHolding {
  name: string;
  code: string;
  quantity: number;
  buyPrice: number;
  currentPrice: number;
}

export const initialPortfolio: StockHolding[] = [
  { name: '苹果', code: 'AAPL', quantity: 50, buyPrice: 178.50, currentPrice: 192.30 },
  { name: '特斯拉', code: 'TSLA', quantity: 30, buyPrice: 245.00, currentPrice: 231.80 },
  { name: '英伟达', code: 'NVDA', quantity: 20, buyPrice: 480.00, currentPrice: 520.50 },
  { name: '微软', code: 'MSFT', quantity: 40, buyPrice: 380.00, currentPrice: 415.20 },
  { name: '谷歌', code: 'GOOGL', quantity: 25, buyPrice: 140.00, currentPrice: 152.80 },
  { name: '亚马逊', code: 'AMZN', quantity: 35, buyPrice: 185.00, currentPrice: 178.50 },
  { name: '腾讯', code: '0700.HK', quantity: 100, buyPrice: 320.00, currentPrice: 358.00 },
  { name: '茅台', code: '600519', quantity: 5, buyPrice: 1680.00, currentPrice: 1720.50 },
];

export const assetTrend = [
  { date: '1月', value: 98000 },
  { date: '2月', value: 102000 },
  { date: '3月', value: 95000 },
  { date: '4月', value: 108000 },
  { date: '5月', value: 105000 },
  { date: '6月', value: 112000 },
  { date: '7月', value: 115000 },
  { date: '8月', value: 110000 },
  { date: '9月', value: 118000 },
  { date: '10月', value: 116000 },
  { date: '11月', value: 122000 },
  { date: '12月', value: 120000 },
];

export interface MarketStock {
  name: string;
  code: string;
  price: number;
  change: number;
  changePercent: number;
}

export const marketStocks: MarketStock[] = [
  { name: '苹果', code: 'AAPL', price: 192.30, change: 3.20, changePercent: 1.69 },
  { name: '特斯拉', code: 'TSLA', price: 231.80, change: -8.50, changePercent: -3.54 },
  { name: '英伟达', code: 'NVDA', price: 520.50, change: 15.30, changePercent: 3.03 },
  { name: '微软', code: 'MSFT', price: 415.20, change: 5.80, changePercent: 1.42 },
  { name: '谷歌', code: 'GOOGL', price: 152.80, change: 2.10, changePercent: 1.39 },
  { name: '亚马逊', code: 'AMZN', price: 178.50, change: -3.20, changePercent: -1.76 },
  { name: 'Meta', code: 'META', price: 505.60, change: 12.40, changePercent: 2.51 },
  { name: '台积电', code: 'TSM', price: 148.90, change: 4.50, changePercent: 3.12 },
  { name: '腾讯', code: '0700.HK', price: 358.00, change: 8.00, changePercent: 2.29 },
  { name: '茅台', code: '600519', price: 1720.50, change: -15.50, changePercent: -0.89 },
  { name: '比亚迪', code: '002594', price: 268.30, change: 6.70, changePercent: 2.56 },
  { name: '宁德时代', code: '300750', price: 198.50, change: -4.30, changePercent: -2.12 },
];

export const aiAdvice = {
  conservative: {
    risk: '低风险',
    position: '建议增加债券类资产配置至40%，降低个股集中度，单只股票仓位不超过10%',
    actions: [
      { type: 'buy' as const, stock: '沪深300ETF', code: '510300', quantity: 200, reason: '分散风险，获取市场平均收益' },
      { type: 'sell' as const, stock: '特斯拉', code: 'TSLA', quantity: 20, reason: '波动率过高，不适合保守型策略' },
      { type: 'buy' as const, stock: '国债ETF', code: '511010', quantity: 500, reason: '增加固收类资产占比' },
    ],
  },
  balanced: {
    risk: '中等风险',
    position: '当前持仓科技股占比偏高（65%），建议降低至45%，增加消费和医疗板块配置',
    actions: [
      { type: 'buy' as const, stock: '苹果', code: 'AAPL', quantity: 20, reason: '基本面强劲，估值合理' },
      { type: 'sell' as const, stock: '特斯拉', code: 'TSLA', quantity: 10, reason: '短期估值偏高，建议减仓' },
      { type: 'buy' as const, stock: '强生', code: 'JNJ', quantity: 30, reason: '医疗板块防御性强，分散组合风险' },
    ],
  },
  aggressive: {
    risk: '高风险',
    position: '建议集中持仓高成长性科技股，可适当使用杠杆，目标年化收益30%+',
    actions: [
      { type: 'buy' as const, stock: '英伟达', code: 'NVDA', quantity: 15, reason: 'AI芯片龙头，增长确定性高' },
      { type: 'buy' as const, stock: 'Meta', code: 'META', quantity: 20, reason: 'AI广告变现潜力巨大' },
      { type: 'sell' as const, stock: '茅台', code: '600519', quantity: 3, reason: '增长放缓，资金效率不足' },
    ],
  },
  longterm: {
    risk: '中低风险',
    position: '长期持有优质蓝筹，定期再平衡，避免频繁交易产生的摩擦成本',
    actions: [
      { type: 'buy' as const, stock: '微软', code: 'MSFT', quantity: 10, reason: '云计算+AI双轮驱动，长期价值突出' },
      { type: 'buy' as const, stock: '腾讯', code: '0700.HK', quantity: 50, reason: '中国互联网龙头，长期增长空间大' },
      { type: 'hold' as const, stock: '苹果', code: 'AAPL', quantity: 0, reason: '继续持有，生态护城河深厚' },
    ],
  },
  shortterm: {
    risk: '极高风险',
    position: '关注短期技术面信号和市场情绪，快进快出，严格止损线设在-5%',
    actions: [
      { type: 'buy' as const, stock: '台积电', code: 'TSM', quantity: 40, reason: '突破关键阻力位，短期看涨' },
      { type: 'sell' as const, stock: '亚马逊', code: 'AMZN', quantity: 35, reason: '跌破支撑位，建议止损' },
      { type: 'buy' as const, stock: '比亚迪', code: '002594', quantity: 100, reason: '放量突破，短线机会' },
    ],
  },
};

export type AdviceStyle = keyof typeof aiAdvice;
