import { getBaseUrl } from './config';

function isTauriEnv(): boolean {
  return !!(window as any).__TAURI_INTERNALS__;
}

let tauriFetch: typeof fetch | null = null;

// 动态加载 Tauri HTTP 插件的 fetch
async function getTauriFetch(): Promise<typeof fetch> {
  if (!tauriFetch) {
    const mod = await import('@tauri-apps/plugin-http');
    tauriFetch = mod.fetch;
  }
  return tauriFetch;
}

/**
 * 带认证头的 fetch 封装。
 * - Tauri 环境：使用 @tauri-apps/plugin-http 的 fetch（绕过 WKWebView 混合内容限制）
 * - Web 环境：使用原生 fetch
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = localStorage.getItem('auth_token');
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // 处理 URL
  let url = input;
  if (typeof url === 'string' && url.startsWith('/')) {
    url = `${getBaseUrl()}${url}`;
  }

  if (isTauriEnv()) {
    const pluginFetch = await getTauriFetch();
    return pluginFetch(url, { ...init, headers });
  }

  return fetch(url, { ...init, headers });
}
