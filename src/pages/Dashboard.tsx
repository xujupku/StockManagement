import { useEffect, useState } from 'react';
import { useStocks } from '../context/StockContext';
import { fetchAssetSnapshots, type AssetSnapshot } from '../api/assetSnapshot';

function TrendChart() {
  const [data, setData] = useState<AssetSnapshot[]>([]);

  useEffect(() => {
    fetchAssetSnapshots(90).then(setData).catch(() => {});
  }, []);

  if (data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">资产变化趋势</h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-12">暂无数据，每日北京时间 10:00 自动记录</p>
      </div>
    );
  }

  const values = data.map(d => d.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const h = 200;
  const w = 100;
  const padX = 2;
  const effectiveW = w - padX * 2;

  const points = data.map((d, i) => {
    const x = padX + (data.length > 1 ? (i / (data.length - 1)) * effectiveW : effectiveW / 2);
    const y = h - ((d.value - min) / range) * (h - 20) - 10;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `${padX},${h} ${points} ${padX + (data.length > 1 ? effectiveW : effectiveW / 2)},${h}`;

  // 动态选择横轴标签（最多显示 7 个）
  const maxLabels = 7;
  const step = Math.max(1, Math.floor(data.length / maxLabels));
  const labelIndices: number[] = [];
  for (let i = 0; i < data.length; i += step) {
    labelIndices.push(i);
  }
  if (labelIndices[labelIndices.length - 1] !== data.length - 1) {
    labelIndices.push(data.length - 1);
  }

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">资产变化趋势</h3>
      <svg viewBox={`0 -10 ${w} ${h + 30}`} className="w-full h-52" preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill="url(#areaGradient)" />
        <polyline points={points} fill="none" stroke="#6366f1" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => {
          const x = padX + (data.length > 1 ? (i / (data.length - 1)) * effectiveW : effectiveW / 2);
          const y = h - ((d.value - min) / range) * (h - 20) - 10;
          return <circle key={i} cx={x} cy={y} r="0.8" fill="#6366f1" />;
        })}
        {labelIndices.map(i => {
          const x = padX + (data.length > 1 ? (i / (data.length - 1)) * effectiveW : effectiveW / 2);
          return (
            <text key={i} x={x} y={h + 12} textAnchor="middle" fontSize="3.5" fill="currentColor" className="text-gray-400">
              {formatDate(data[i].date)}
            </text>
          );
        })}
      </svg>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-sm shadow-xl border border-gray-200 dark:border-gray-700" onClick={e => e.stopPropagation()}>
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
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition">
            取消
          </button>
          <button
            onClick={() => { const v = parseFloat(amount); if (v > 0) { onConfirm(v); onClose(); } }}
            className={`flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium transition ${type === 'deposit' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-orange-500 hover:bg-orange-600'}`}
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
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-8 text-white shadow-lg">
        <div>
          <p className="text-sm opacity-80">总资产 (CNY)</p>
          <p className="text-4xl font-bold mt-1">¥{totalAssets.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          <p className="mt-2 text-sm opacity-70">
            汇率 · 1 USD = {rates.USD?.toFixed(4)} CNY · 1 HKD = {rates.HKD?.toFixed(4)} CNY
          </p>
          <p className="mt-1 text-sm opacity-70">
            现金合计 ¥{totalCashCNY.toLocaleString(undefined, { maximumFractionDigits: 0 })} · 持仓合计 ¥{holdingsValueCNY.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
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
                  className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition"
                >
                  存入
                </button>
                <button
                  onClick={() => setCashModal({ type: 'withdraw', currency: cur })}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs font-medium hover:bg-orange-100 dark:hover:bg-orange-900/50 transition"
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
