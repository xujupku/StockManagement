import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStocks } from '../context/StockContext';
import { fetchAssetSnapshots, triggerSnapshot, type AssetSnapshot } from '../api/assetSnapshot';

type TrendRangeKey = '7D' | '30D' | '90D';

const TREND_RANGES: { key: TrendRangeKey; label: string; days: number }[] = [
  { key: '7D', label: '7D', days: 7 },
  { key: '30D', label: '30D', days: 30 },
  { key: '90D', label: '90D', days: 90 },
];

function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const controlX = (current.x + next.x) / 2;
    path += ` Q ${controlX} ${current.y}, ${next.x} ${next.y}`;
  }
  return path;
}

function TrendChart() {
  const [data, setData] = useState<AssetSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState<TrendRangeKey>('30D');

  useEffect(() => {
    let cancelled = false;

    const loadSnapshots = async () => {
      try {
        let snapshots = await fetchAssetSnapshots(90);
        if (snapshots.length === 0) {
          try {
            snapshots = [await triggerSnapshot()];
          } catch {
            // Keep the empty state when the first snapshot cannot be created.
          }
        }
        if (!cancelled) {
          setData(snapshots);
        }
      } catch {
        if (!cancelled) {
          setData([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadSnapshots();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">资产变化趋势</h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-12">正在生成趋势数据...</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">资产变化趋势</h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-12">暂无数据，每日北京时间 10:00 自动记录</p>
      </div>
    );
  }

  const rangeConfig = TREND_RANGES.find(item => item.key === selectedRange) ?? TREND_RANGES[1];
  const chartData = data.slice(-Math.min(rangeConfig.days, data.length));
  const values = chartData.map(d => d.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const h = 180;
  const w = 100;
  const padX = 4;
  const padTop = 16;
  const padBottom = 26;
  const effectiveW = w - padX * 2;

  const pointCoords = chartData.map((d, i) => {
    const x = padX + (chartData.length > 1 ? (i / (chartData.length - 1)) * effectiveW : effectiveW / 2);
    const y = h - padBottom - ((d.value - min) / range) * (h - padTop - padBottom);
    return { x, y };
  });

  const smoothPath = buildSmoothPath(pointCoords);
  const areaPath = `${smoothPath} L ${padX + (chartData.length > 1 ? effectiveW : effectiveW / 2)} ${h - 8} L ${padX} ${h - 8} Z`;

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  };

  const formatAmount = (value: number) => `¥${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const latest = chartData[chartData.length - 1];
  const first = chartData[0];
  const isSinglePoint = chartData.length === 1;
  const delta = latest.value - first.value;
  const deltaPercent = first.value > 0 ? (delta / first.value) * 100 : 0;
  const trendUp = delta >= 0;
  const latestPoint = pointCoords[pointCoords.length - 1];
  const latestDateLabel = latest.date.replace(/-/g, '.');
  const xAxisLabels = isSinglePoint
    ? [{ key: latest.date, text: formatDate(latest.date), align: 'center' as const }]
    : [
        { key: chartData[0].date, text: formatDate(chartData[0].date), align: 'left' as const },
        { key: chartData[Math.floor((chartData.length - 1) / 2)].date, text: formatDate(chartData[Math.floor((chartData.length - 1) / 2)].date), align: 'center' as const },
        { key: latest.date, text: formatDate(latest.date), align: 'right' as const },
      ].filter((item, index, arr) => arr.findIndex(other => other.key === item.key) === index);
  const gridLineYs = [0.18, 0.45, 0.72].map(ratio => padTop + ratio * (h - padTop - padBottom));
  const chartTopLabel = formatAmount(max);
  const chartBottomLabel = formatAmount(min);
  const lineStartColor = trendUp ? '#34d399' : '#f87171';
  const lineEndColor = trendUp ? '#10b981' : '#ef4444';
  const chipClass = trendUp
    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/12 dark:text-emerald-300'
    : 'bg-red-50 text-red-600 dark:bg-red-500/12 dark:text-red-300';
  const lineGlowColor = trendUp ? '#10b981' : '#ef4444';
  const lineTintClass = trendUp ? 'text-emerald-400 dark:text-emerald-300' : 'text-red-400 dark:text-red-300';

  return (
    <div className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-[#081224] md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">资产变化趋势</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-3xl font-semibold tracking-tight text-gray-950 dark:text-white md:text-4xl">
              {formatAmount(latest.value)}
            </p>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                isSinglePoint
                  ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/12 dark:text-indigo-300'
                  : chipClass
              }`}
            >
              {isSinglePoint
                ? '已生成首条记录'
                : `${trendUp ? '+' : ''}${formatAmount(delta).replace('¥', '')} (${trendUp ? '+' : ''}${deltaPercent.toFixed(2)}%)`}
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            {isSinglePoint ? '后续快照会自动叠加，趋势曲线将逐步形成。' : `对比首条记录 ${formatDate(first.date)} 的资产变化。`}
          </p>
        </div>
        <div className="shrink-0 rounded-2xl bg-gray-50 px-3 py-2 text-right dark:bg-white/[0.04]">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">Latest</p>
          <p className="mt-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{latestDateLabel}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          <span>当前区间</span>
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-medium ${isSinglePoint ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/12 dark:text-indigo-300' : chipClass}`}>
            {rangeConfig.label}
          </span>
        </div>
        <div className="inline-flex rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]">
          {TREND_RANGES.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSelectedRange(item.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                selectedRange === item.key
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white'
                  : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-[24px] border border-gray-100 bg-gradient-to-b from-slate-50 to-white px-4 py-4 dark:border-white/6 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(15,23,42,0.18))]">
        <div className="mb-2 flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500">
          <span>区间高点 {chartTopLabel}</span>
          {!isSinglePoint && <span>区间低点 {chartBottomLabel}</span>}
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} className="h-48 w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="trendAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineStartColor} stopOpacity="0.26" />
              <stop offset="65%" stopColor={lineStartColor} stopOpacity="0.08" />
              <stop offset="100%" stopColor={lineStartColor} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="trendLineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={lineStartColor} />
              <stop offset="100%" stopColor={lineEndColor} />
            </linearGradient>
            <filter id="trendGlow">
              <feGaussianBlur stdDeviation="2.8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {gridLineYs.map((y, index) => (
            <line
              key={index}
              x1={padX}
              y1={y}
              x2={w - padX}
              y2={y}
              stroke="currentColor"
              strokeOpacity="0.12"
              strokeWidth="0.5"
              strokeDasharray="2 4"
              className="text-slate-400 dark:text-slate-500"
            />
          ))}

          {isSinglePoint ? (
            <>
              <line
                x1={padX + 6}
                y1={h / 2}
                x2={w - padX - 6}
                y2={h / 2}
                stroke="currentColor"
                strokeOpacity="0.18"
                strokeWidth="0.7"
                strokeDasharray="3 4"
                className={lineTintClass}
              />
              <circle cx={w / 2} cy={h / 2} r="8" fill={lineGlowColor} fillOpacity="0.10" />
              <circle cx={w / 2} cy={h / 2} r="4.6" fill={lineGlowColor} fillOpacity="0.20" />
              <circle cx={w / 2} cy={h / 2} r="2.4" fill={lineGlowColor} />
              <rect x={w / 2 - 12} y={h / 2 - 28} rx="5" ry="5" width="24" height="10" fill={trendUp ? '#ecfdf5' : '#fef2f2'} className="dark:fill-[rgba(255,255,255,0.06)]" />
              <text x={w / 2} y={h / 2 - 21} textAnchor="middle" fontSize="3.4" fill={lineGlowColor} fontWeight="600">
                首次记录
              </text>
            </>
          ) : (
            <>
              <path d={areaPath} fill="url(#trendAreaGradient)" />
              <path d={smoothPath} fill="none" stroke="url(#trendLineGradient)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" filter="url(#trendGlow)" />
              {pointCoords.map((point, index) => (
                <circle
                  key={index}
                  cx={point.x}
                  cy={point.y}
                  r={index === pointCoords.length - 1 ? 2.1 : 1.1}
                  fill={index === pointCoords.length - 1 ? lineEndColor : lineStartColor}
                />
              ))}
              <circle cx={latestPoint.x} cy={latestPoint.y} r="4.8" fill={lineGlowColor} fillOpacity="0.12" />
            </>
          )}
        </svg>

        <div className="mt-1 flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500">
          {xAxisLabels.map(label => (
            <span
              key={label.key}
              className={
                label.align === 'left'
                  ? 'text-left'
                  : label.align === 'right'
                  ? 'text-right'
                  : 'text-center'
              }
            >
              {label.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const CURRENCY_META: Record<string, { symbol: string; label: string; color: string }> = {
  CNY: { symbol: '¥', label: '人民币', color: 'from-red-500 to-orange-500' },
  USD: { symbol: '$', label: '美元', color: 'from-green-500 to-emerald-600' },
  HKD: { symbol: 'HK$', label: '港元', color: 'from-blue-500 to-cyan-500' },
};

function CashModal({ onClose, onConfirm, type, currency }: {
  onClose: () => void;
  onConfirm: (amount: number) => void;
  type: 'deposit' | 'withdraw';
  currency: string;
}) {
  const [amount, setAmount] = useState('');
  const meta = CURRENCY_META[currency];

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-t-2xl md:rounded-2xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom)+3.5rem)] md:pb-6 w-full md:max-w-sm shadow-xl border border-gray-200 dark:border-gray-700" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          {type === 'deposit' ? '存入' : '取出'}{meta.label}
        </h2>
        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">金额 ({meta.symbol})</label>
          <input
            type="number"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="请输入金额"
            autoFocus
          />
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 transition">
            取消
          </button>
          <button
            onClick={() => { const v = parseFloat(amount); if (v > 0) { onConfirm(v); onClose(); } }}
            className={`flex-1 px-4 py-3 rounded-xl text-white text-sm font-medium transition ${type === 'deposit' ? 'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700' : 'bg-orange-500 hover:bg-orange-600 active:bg-orange-700'}`}
          >
            确认{type === 'deposit' ? '存入' : '取出'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { holdings, loading, refreshPrices, cash, setCash, toCNY, rates, totalCashCNY } = useStocks();
  const navigate = useNavigate();
  const [cashModal, setCashModal] = useState<{ type: 'deposit' | 'withdraw'; currency: string } | null>(null);

  // 持仓加载完成后立即刷新价格，之后每 60 秒刷新一次
  useEffect(() => {
    if (loading) return;
    refreshPrices();
    const timer = setInterval(refreshPrices, 60_000);
    return () => clearInterval(timer);
  }, [loading, refreshPrices]);

  // 持仓市值（人民币）
  const holdingsValueCNY = holdings.reduce((sum, s) => sum + toCNY(s.code, s.currentPrice * s.quantity), 0);
  // 持仓成本（人民币）
  const holdingsCostCNY = holdings.reduce((sum, s) => sum + toCNY(s.code, s.buyPrice * s.quantity), 0);
  // 总资产 = 现金（换算人民币） + 持仓市值
  const totalAssets = totalCashCNY + holdingsValueCNY;
  const totalPnl = holdingsValueCNY - holdingsCostCNY;
  const totalPnlPercent = holdingsCostCNY > 0 ? (totalPnl / holdingsCostCNY * 100) : 0;

  const profitStocks = holdings.filter(s => s.currentPrice > s.buyPrice).length;
  const lossStocks = holdings.filter(s => s.currentPrice < s.buyPrice).length;

  const summaryCards = [
    { label: '持仓市值 (CNY)', value: `¥${holdingsValueCNY.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, sub: `${holdings.length} 只股票` },
    {
      label: '盈利 / 亏损',
      value: `${profitStocks} / ${lossStocks}`,
      sub: holdings.length > 0 ? `胜率 ${((profitStocks / holdings.length) * 100).toFixed(0)}%` : '-',
      color: profitStocks > lossStocks ? 'text-emerald-500' : 'text-red-500',
    },
    {
      label: '持仓盈亏',
      value: `${totalPnl >= 0 ? '+' : ''}¥${totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      sub: `${totalPnlPercent >= 0 ? '+' : ''}${totalPnlPercent.toFixed(2)}%`,
      color: totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* 总资产 */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-5 md:p-8 text-white shadow-lg">
        <div>
          <p className="text-xs md:text-sm opacity-80">总资产 (CNY)</p>
          <p className="text-3xl md:text-4xl font-bold mt-1">¥{totalAssets.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          <p className="mt-2 text-xs md:text-sm opacity-70">
            汇率 · 1 USD = {rates.USD?.toFixed(4)} CNY · 1 HKD = {rates.HKD?.toFixed(4)} CNY
          </p>
          <p className="mt-1 text-xs md:text-sm opacity-70">
            现金合计 ¥{totalCashCNY.toLocaleString(undefined, { maximumFractionDigits: 0 })} · 持仓合计 ¥{holdingsValueCNY.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* 快捷入口 - 仅移动端显示 */}
      <div className="grid grid-cols-2 gap-3 md:hidden">
        <button
          onClick={() => navigate('/advisor')}
          className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 active:bg-gray-50 dark:active:bg-gray-800 transition"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900 dark:text-white">持仓分析</p>
            <p className="text-[11px] text-gray-400">AI智能诊断</p>
          </div>
        </button>
        <button
          onClick={() => navigate('/market')}
          className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 active:bg-gray-50 dark:active:bg-gray-800 transition"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900 dark:text-white">市场行情</p>
            <p className="text-[11px] text-gray-400">实时大盘数据</p>
          </div>
        </button>
      </div>

      {/* 三种现金余额 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(['CNY', 'USD', 'HKD'] as const).map(cur => {
          const meta = CURRENCY_META[cur];
          const amount = cash[cur] ?? 0;
          return (
            <div key={cur} className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full bg-gradient-to-r ${meta.color}`} />
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{meta.label} ({cur})</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {meta.symbol}{amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              {cur !== 'CNY' && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  ≈ ¥{(amount * (rates[cur] ?? 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setCashModal({ type: 'deposit', currency: cur })}
                  className="flex-1 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/50 active:bg-emerald-200 transition"
                >
                  存入
                </button>
                <button
                  onClick={() => setCashModal({ type: 'withdraw', currency: cur })}
                  className="flex-1 px-3 py-2 rounded-xl bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs font-medium hover:bg-orange-100 dark:hover:bg-orange-900/50 active:bg-orange-200 transition"
                >
                  取出
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {summaryCards.map(card => (
          <div key={card.label} className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
            <p className={`text-2xl font-bold mt-1 ${card.color ?? 'text-gray-900 dark:text-white'}`}>
              {card.value}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* 趋势图 */}
      <TrendChart />

      {/* 现金弹窗 */}
      {cashModal && (
        <CashModal
          type={cashModal.type}
          currency={cashModal.currency}
          onClose={() => setCashModal(null)}
          onConfirm={amount => {
            const cur = cashModal.currency;
            const current = cash[cur as keyof typeof cash] ?? 0;
            if (cashModal.type === 'deposit') {
              setCash(cur, current + amount);
            } else {
              setCash(cur, Math.max(0, current - amount));
            }
          }}
        />
      )}
    </div>
  );
}
