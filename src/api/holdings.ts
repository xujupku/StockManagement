import type { StockHolding } from '../data/mockData';
import { authFetch } from './authFetch';

const BASE = '/api/holdings';

interface ServerHolding {
  name: string;
  code: string;
  quantity: number;
  buy_price: number;
  current_price: number;
}

function toClient(s: ServerHolding): StockHolding {
  return {
    name: s.name,
    code: s.code,
    quantity: s.quantity,
    buyPrice: s.buy_price,
    currentPrice: s.current_price,
  };
}

function toServer(h: Omit<StockHolding, 'currentPrice'> & { currentPrice?: number }): ServerHolding {
  return {
    name: h.name,
    code: h.code,
    quantity: h.quantity,
    buy_price: h.buyPrice,
    current_price: h.currentPrice ?? h.buyPrice,
  };
}

export async function fetchHoldings(): Promise<StockHolding[]> {
  const res = await authFetch(BASE);
  if (!res.ok) throw new Error('获取持仓失败');
  const data: ServerHolding[] = await res.json();
  return data.map(toClient);
}

export async function createHolding(h: Omit<StockHolding, 'currentPrice'> & { currentPrice?: number }): Promise<StockHolding> {
  const res = await authFetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toServer(h)),
  });
  if (!res.ok) throw new Error('添加持仓失败');
  return toClient(await res.json());
}

export async function updateHoldingApi(code: string, data: Partial<StockHolding>): Promise<StockHolding> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.quantity !== undefined) body.quantity = data.quantity;
  if (data.buyPrice !== undefined) body.buy_price = data.buyPrice;
  if (data.currentPrice !== undefined) body.current_price = data.currentPrice;

  const res = await authFetch(`${BASE}/${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('更新持仓失败');
  return toClient(await res.json());
}

export async function deleteHoldingApi(code: string): Promise<void> {
  const res = await authFetch(`${BASE}/${encodeURIComponent(code)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('删除持仓失败');
}
