const BASE = '/api/cash';

export interface CashBalances {
  CNY: number;
  HKD: number;
  USD: number;
}

export async function fetchCash(): Promise<CashBalances> {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error('获取现金失败');
  return res.json();
}

export async function updateCashApi(currency: string, amount: number): Promise<CashBalances> {
  const res = await fetch(BASE, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currency, amount }),
  });
  if (!res.ok) throw new Error('更新现金失败');
  return res.json();
}

export async function fetchRates(): Promise<Record<string, number>> {
  const res = await fetch('/api/rates');
  if (!res.ok) throw new Error('获取汇率失败');
  return res.json();
}
