import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { type StockHolding } from '../data/mockData';
import { fetchHoldings, createHolding, updateHoldingApi, deleteHoldingApi } from '../api/holdings';
import { fetchPrices } from '../api/stockPrice';
import { fetchCash, updateCashApi, fetchRates, type CashBalances } from '../api/cash';

interface StockContextType {
  holdings: StockHolding[];
  loading: boolean;
  cash: CashBalances;
  rates: Record<string, number>;
  addHolding: (h: Omit<StockHolding, 'currentPrice'>) => void;
  removeHolding: (code: string) => void;
  updateHolding: (code: string, data: Partial<StockHolding>) => void;
  refreshPrices: () => Promise<void>;
  setCash: (currency: string, amount: number) => Promise<void>;
  /** 根据股票代码将金额换算为人民币 */
  toCNY: (code: string, value: number) => number;
  /** 现金总值（换算为人民币） */
  totalCashCNY: number;
}

const StockContext = createContext<StockContextType>(null!);

const DEFAULT_CASH: CashBalances = { CNY: 100000, HKD: 0, USD: 0 };

/** 根据股票代码判断币种 */
function getCurrency(code: string): string {
  if (code.endsWith('.HK')) return 'HKD';
  if (/^\d+$/.test(code) && code.length <= 5) return 'HKD'; // 5位及以下纯数字为港股
  if (code[0] >= '0' && code[0] <= '9') return 'CNY'; // 6位纯数字为A股
  return 'USD';
}

export function StockProvider({ children }: { children: ReactNode }) {
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [cash, setCashState] = useState<CashBalances>(DEFAULT_CASH);
  const [rates, setRates] = useState<Record<string, number>>({ USD: 6.8628, HKD: 0.87581, CNY: 1 });

  useEffect(() => {
    let ignore = false;
    Promise.all([
      fetchHoldings().catch(() => null),
      fetchCash().catch(() => DEFAULT_CASH),
      fetchRates().catch(() => ({ USD: 6.8628, HKD: 0.87581, CNY: 1 })),
    ]).then(([holdingsData, cashData, ratesData]) => {
      if (ignore) return;
      if (holdingsData) {
        setHoldings(holdingsData);
      } else {
        import('../data/mockData').then(m => { if (!ignore) setHoldings(m.initialPortfolio); });
      }
      setCashState(cashData);
      setRates(ratesData);
      setLoading(false);
    });
    return () => { ignore = true; };
  }, []);

  const addHolding = async (h: Omit<StockHolding, 'currentPrice'>) => {
    const randomDelta = (Math.random() - 0.4) * h.buyPrice * 0.2;
    const currentPrice = +(h.buyPrice + randomDelta).toFixed(2);
    const newHolding = { ...h, currentPrice };

    setHoldings(prev => [...prev, newHolding]);

    try {
      await createHolding({ ...h, currentPrice });
    } catch {
      setHoldings(prev => prev.filter(s => s.code !== h.code));
    }
  };

  const removeHolding = async (code: string) => {
    const prev = holdings;
    setHoldings(prev => prev.filter(s => s.code !== code));

    try {
      await deleteHoldingApi(code);
    } catch {
      setHoldings(prev);
    }
  };

  const updateHolding = async (code: string, data: Partial<StockHolding>) => {
    const prev = holdings;
    setHoldings(prev => prev.map(s => s.code === code ? { ...s, ...data } : s));

    try {
      await updateHoldingApi(code, data);
    } catch {
      setHoldings(prev);
    }
  };

  const holdingsRef = useRef(holdings);
  holdingsRef.current = holdings;

  const refreshPrices = useCallback(async () => {
    const codes = holdingsRef.current.map(h => h.code);
    if (codes.length === 0) return;
    try {
      const prices = await fetchPrices(codes);
      setHoldings(prev =>
        prev.map(h => prices[h.code] != null ? { ...h, currentPrice: prices[h.code] } : h),
      );
    } catch {
      // 静默失败
    }
  }, []);

  const setCash = useCallback(async (currency: string, amount: number) => {
    setCashState(prev => ({ ...prev, [currency]: amount }));
    try {
      const updated = await updateCashApi(currency, amount);
      setCashState(updated);
    } catch {
      // 静默失败
    }
  }, []);

  const toCNY = useCallback((code: string, value: number) => {
    const currency = getCurrency(code);
    return value * (rates[currency] ?? 1);
  }, [rates]);

  // 现金总值（人民币）
  const totalCashCNY = (cash.CNY ?? 0) + (cash.USD ?? 0) * (rates.USD ?? 1) + (cash.HKD ?? 0) * (rates.HKD ?? 1);

  return (
    <StockContext.Provider value={{ holdings, loading, cash, rates, addHolding, removeHolding, updateHolding, refreshPrices, setCash, toCNY, totalCashCNY }}>
      {children}
    </StockContext.Provider>
  );
}

export const useStocks = () => useContext(StockContext);
