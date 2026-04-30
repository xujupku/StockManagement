import { useEffect, useState, useCallback } from 'react';
import { useStocks } from '../context/StockContext';

interface WatchStock {
  code: string;
  name: string;
}

interface Quote {
  price: number;
  prevClose: number | null;
}

function getSymbol(code: string) {
  if (code.endsWith('.HK')) return 'HK$';
  if (/^\d+$/.test(code) && code.length <= 5) return 'HK$';
  if (code[0] >= '0' && code[0] <= '9') return '¥';
  return '$';
}

async function fetchWatchlist(): Promise<WatchStock[]> {
  try {
    const res = await fetch('/api/watchlist');
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

async function fetchQuotes(codes: string[]): Promise<Record<string, Quote>> {
  if (codes.length === 0) return {};
  try {
    const res = await fetch(`/api/quotes?codes=${encodeURIComponent(codes.join(','))}`);
    if (!res.ok) return {};
    return res.json();
  } catch { return {}; }
}

async function addWatch(code: string, name: string) {
  await fetch('/api/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, name }),
  });
}

async function removeWatch(code: string) {
  await fetch(`/api/watchlist/${encodeURIComponent(code)}`, { method: 'DELETE' });
}

function AddStockModal({ onClose, onAdd }: { onClose: () => void; onAdd: (code: string, name: string) => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-sm shadow-xl border border-gray-200 dark:border-gray-700" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">添加关注股票</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">股票代码</label>
            <input
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="如 AAPL、0700.HK、600519"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">股票名称</label>
            <input
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              value={name} onChange={e => setName(e.target.value)}
              placeholder="如 苹果、腾讯"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition">
            取消
          </button>
          <button
            onClick={() => { if (code.trim() && name.trim()) { onAdd(code.trim(), name.trim()); onClose(); } }}
            className="flex-1 px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition"
          >
            确认添加
          </button>
        </div>
      </div>
    </div>
  );
}

function AddHoldingModal({ stock, currentPrice, onClose, onSubmit }: {
  stock: WatchStock;
  currentPrice: number | undefined;
  onClose: () => void;
  onSubmit: (data: { name: string; code: string; quantity: number; buyPrice: number }) => void;
}) {
  const [quantity, setQuantity] = useState('');
  const [buyPrice, setBuyPrice] = useState(currentPrice?.toFixed(2) ?? '');
  const sym = getSymbol(stock.code);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md shadow-xl border border-gray-200 dark:border-gray-700" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">加入持仓</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">股票名称</label>
              <input className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none"
                value={stock.name} disabled />
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">股票代码</label>
              <input className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none"
                value={stock.code} disabled />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">买入价格 ({sym})</label>
              <input type="number" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder="买入价" autoFocus />
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">持仓数量</label>
              <input type="number" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="数量" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition">
            取消
          </button>
          <button
            onClick={() => {
              const q = parseInt(quantity);
              const p = parseFloat(buyPrice);
              if (q > 0 && p > 0) {
                onSubmit({ name: stock.name, code: stock.code, quantity: q, buyPrice: p });
                onClose();
              }
            }}
            className="flex-1 px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition"
          >
            确认加入
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Market() {
  const { holdings, addHolding } = useStocks();
  const holdingCodes = new Set(holdings.map(h => h.code));

  const [watchlist, setWatchlist] = useState<WatchStock[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [addToPortfolio, setAddToPortfolio] = useState<WatchStock | null>(null);

  // 加载关注列表
  useEffect(() => {
    fetchWatchlist().then(setWatchlist);
  }, []);

  // 获取实时行情（含前收盘价）
  const refreshQuotes = useCallback(async (list: WatchStock[]) => {
    if (list.length === 0) return;
    const q = await fetchQuotes(list.map(s => s.code));
    setQuotes(q);
  }, []);

  // 关注列表变化后立即刷新，之后每 5 分钟刷新
  useEffect(() => {
    if (watchlist.length === 0) return;
    refreshQuotes(watchlist);
    const timer = setInterval(() => refreshQuotes(watchlist), 5 * 60_000);
    return () => clearInterval(timer);
  }, [watchlist, refreshQuotes]);

  const handleAdd = async (code: string, name: string) => {
    const newItem = { code, name };
    setWatchlist(prev => [...prev.filter(w => w.code !== code), newItem]);
    await addWatch(code, name);
  };

  const handleRemove = async (code: string) => {
    setWatchlist(prev => prev.filter(w => w.code !== code));
    await removeWatch(code);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">市场行情</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition"
        >
          + 添加关注
        </button>
      </div>

      {watchlist.length === 0 ? (
        <p className="text-center text-gray-400 dark:text-gray-500 py-12">暂无关注股票，点击右上角添加</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {watchlist.map(stock => {
            const quote = quotes[stock.code];
            const price = quote?.price;
            const prevClose = quote?.prevClose;
            const sym = getSymbol(stock.code);
            const inPortfolio = holdingCodes.has(stock.code);

            // 涨跌计算
            const change = price != null && prevClose ? price - prevClose : null;
            const changePct = change != null && prevClose ? (change / prevClose) * 100 : null;
            const isUp = change != null && change >= 0;

            return (
              <div key={stock.code} className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{stock.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{stock.code}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {changePct != null && (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        isUp
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                          : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                      }`}>
                        {isUp ? '+' : ''}{changePct.toFixed(2)}%
                      </span>
                    )}
                    <button
                      onClick={() => handleRemove(stock.code)}
                      className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition"
                      title="取消关注"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-3">
                  {price != null ? `${sym}${price.toFixed(2)}` : <span className="text-gray-300 dark:text-gray-600">--</span>}
                </p>
                {change != null && (
                  <p className={`text-sm mt-1 ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>
                    {isUp ? '+' : ''}{sym}{change.toFixed(2)}
                  </p>
                )}

                <button
                  disabled={inPortfolio}
                  onClick={() => { if (!inPortfolio) setAddToPortfolio(stock); }}
                  className={`mt-3 px-3 py-1 rounded-lg text-xs font-medium transition ${
                    inPortfolio
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                      : 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20'
                  }`}
                >
                  {inPortfolio ? '已在持仓中' : '加入持仓'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && <AddStockModal onClose={() => setShowAdd(false)} onAdd={handleAdd} />}

      {addToPortfolio && (
        <AddHoldingModal
          stock={addToPortfolio}
          currentPrice={quotes[addToPortfolio.code]?.price}
          onClose={() => setAddToPortfolio(null)}
          onSubmit={data => addHolding(data)}
        />
      )}
    </div>
  );
}
