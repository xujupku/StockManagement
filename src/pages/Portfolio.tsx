import { useState, useEffect } from 'react';
import { useStocks } from '../context/StockContext';

interface ModalProps {
  onClose: () => void;
  onSubmit: (data: { name: string; code: string; quantity: number; buyPrice: number }) => void;
  initial?: { name: string; code: string; quantity: number; buyPrice: number };
  title: string;
}

function StockModal({ onClose, onSubmit, initial, title }: ModalProps) {
  const [form, setForm] = useState(initial ?? { name: '', code: '', quantity: 0, buyPrice: 0 });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md shadow-xl border border-gray-200 dark:border-gray-700" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{title}</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">股票名称</label>
            <input className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="如：苹果" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">股票代码</label>
            <input className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="如：AAPL" disabled={!!initial} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">买入价格</label>
              <input type="number" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                value={form.buyPrice || ''} onChange={e => setForm(f => ({ ...f, buyPrice: +e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">持仓数量</label>
              <input type="number" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                value={form.quantity || ''} onChange={e => setForm(f => ({ ...f, quantity: +e.target.value }))} />
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition">
            取消
          </button>
          <button
            onClick={() => { if (form.code && form.quantity > 0 && form.buyPrice > 0) { onSubmit(form); onClose(); } }}
            className="flex-1 px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Portfolio() {
  const { holdings, loading, addHolding, removeHolding, updateHolding, refreshPrices } = useStocks();
  const [showAdd, setShowAdd] = useState(false);
  const [editCode, setEditCode] = useState<string | null>(null);

  // 持仓加载完成后立即刷新价格，之后每 60 秒刷新一次
  useEffect(() => {
    if (loading) return;
    refreshPrices();
    const timer = setInterval(refreshPrices, 60_000);
    return () => clearInterval(timer);
  }, [loading, refreshPrices]);

  const editStock = editCode ? holdings.find(s => s.code === editCode) : null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">我的持仓</h2>
        <button onClick={() => setShowAdd(true)}
          className="px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition shadow-sm">
          + 添加股票
        </button>
      </div>

      {/* 桌面端：表格 */}
      <div className="hidden md:block bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">股票</th>
                <th className="text-right px-4 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">数量</th>
                <th className="text-right px-4 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">买入价</th>
                <th className="text-right px-4 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">现价</th>
                <th className="text-right px-4 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">盈亏</th>
                <th className="text-right px-4 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">盈亏%</th>
                <th className="text-right px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map(stock => {
                const pnl = (stock.currentPrice - stock.buyPrice) * stock.quantity;
                const pnlPercent = ((stock.currentPrice - stock.buyPrice) / stock.buyPrice) * 100;
                const isUp = pnl >= 0;
                const sym = stock.code.endsWith('.HK') || (/^\d+$/.test(stock.code) && stock.code.length <= 5) ? 'HK$' : stock.code[0] >= '0' && stock.code[0] <= '9' ? '¥' : '$';
                return (
                  <tr key={stock.code} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900 dark:text-white">{stock.name}</p>
                      <p className="text-xs text-gray-400">{stock.code}</p>
                    </td>
                    <td className="text-right px-4 py-4 text-gray-700 dark:text-gray-300">{stock.quantity}</td>
                    <td className="text-right px-4 py-4 text-gray-700 dark:text-gray-300">{sym}{stock.buyPrice.toFixed(2)}</td>
                    <td className="text-right px-4 py-4 font-medium text-gray-900 dark:text-white">{sym}{stock.currentPrice.toFixed(2)}</td>
                    <td className={`text-right px-4 py-4 font-medium ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>
                      {isUp ? '+' : ''}{sym}{pnl.toFixed(2)}
                    </td>
                    <td className={`text-right px-4 py-4 font-medium ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>
                      {isUp ? '+' : ''}{pnlPercent.toFixed(2)}%
                    </td>
                    <td className="text-right px-6 py-4">
                      <button onClick={() => setEditCode(stock.code)} className="text-indigo-500 hover:text-indigo-600 text-xs mr-3 font-medium">编辑</button>
                      <button onClick={() => removeHolding(stock.code)} className="text-red-400 hover:text-red-500 text-xs font-medium">删除</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {holdings.length === 0 && (
          <div className="py-16 text-center text-gray-400 dark:text-gray-500">
            暂无持仓，点击"添加股票"开始投资
          </div>
        )}
      </div>

      {/* 移动端：卡片列表 */}
      <div className="md:hidden space-y-3">
        {holdings.length === 0 && (
          <div className="py-16 text-center text-gray-400 dark:text-gray-500">
            暂无持仓，点击"添加股票"开始投资
          </div>
        )}
        {holdings.map(stock => {
          const pnl = (stock.currentPrice - stock.buyPrice) * stock.quantity;
          const pnlPercent = ((stock.currentPrice - stock.buyPrice) / stock.buyPrice) * 100;
          const isUp = pnl >= 0;
          const sym = stock.code.endsWith('.HK') || (/^\d+$/.test(stock.code) && stock.code.length <= 5) ? 'HK$' : stock.code[0] >= '0' && stock.code[0] <= '9' ? '¥' : '$';
          return (
            <div key={stock.code} className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="font-semibold text-gray-900 dark:text-white">{stock.name}</span>
                  <span className="ml-2 text-xs text-gray-400">{stock.code}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditCode(stock.code)} className="text-indigo-500 text-xs font-medium">编辑</button>
                  <button onClick={() => removeHolding(stock.code)} className="text-red-400 text-xs font-medium">删除</button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[11px] text-gray-400 mb-0.5">现价</div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{sym}{stock.currentPrice.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-400 mb-0.5">盈亏</div>
                  <div className={`text-sm font-medium ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>
                    {isUp ? '+' : ''}{sym}{pnl.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-400 mb-0.5">盈亏%</div>
                  <div className={`text-sm font-medium ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>
                    {isUp ? '+' : ''}{pnlPercent.toFixed(2)}%
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50 dark:border-gray-800 text-xs text-gray-400">
                <span>买入 {sym}{stock.buyPrice.toFixed(2)} × {stock.quantity}股</span>
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <StockModal
          title="添加股票"
          onClose={() => setShowAdd(false)}
          onSubmit={data => addHolding(data)}
        />
      )}

      {editStock && (
        <StockModal
          title="编辑持仓"
          initial={{ name: editStock.name, code: editStock.code, quantity: editStock.quantity, buyPrice: editStock.buyPrice }}
          onClose={() => setEditCode(null)}
          onSubmit={data => updateHolding(data.code, { name: data.name, quantity: data.quantity, buyPrice: data.buyPrice })}
        />
      )}
    </div>
  );
}
