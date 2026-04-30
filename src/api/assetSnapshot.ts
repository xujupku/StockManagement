const BASE = '/api/asset-snapshots';

export interface AssetSnapshot {
  date: string;
  value: number;
}

export async function fetchAssetSnapshots(limit = 90): Promise<AssetSnapshot[]> {
  const res = await fetch(`${BASE}?limit=${limit}`);
  if (!res.ok) throw new Error('获取资产快照失败');
  return res.json();
}

export async function triggerSnapshot(): Promise<AssetSnapshot> {
  const res = await fetch(BASE, { method: 'POST' });
  if (!res.ok) throw new Error('触发快照失败');
  return res.json();
}
