const BASE = '/api/prices';

/**
 * 批量获取股票最新价格
 * @returns { [stockCode]: latestPrice }
 */
export async function fetchPrices(codes: string[]): Promise<Record<string, number>> {
  if (codes.length === 0) return {};

  const res = await fetch(`${BASE}?codes=${encodeURIComponent(codes.join(','))}`);
  if (!res.ok) throw new Error('获取行情失败');
  return res.json();
}
