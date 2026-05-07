const DEFAULT_API_URL = 'http://39.96.197.206:8000';

// 判断是否在 Tauri 环境（桌面或移动端）
function isTauriEnv(): boolean {
  return !!(window as any).__TAURI_INTERNALS__;
}

/**
 * 获取 API 基础 URL。
 * - Tauri 环境：使用用户配置的完整 URL（默认 localhost:8000）
 * - Web 环境（Vite dev / Nginx）：使用空字符串（相对路径由 proxy 处理）
 */
export function getBaseUrl(): string {
  if (isTauriEnv()) {
    return localStorage.getItem('analyze_api_url') || DEFAULT_API_URL;
  }
  // Web 环境通过 Vite proxy 或 Nginx 转发，使用相对路径
  return '';
}

export function getApiConfig() {
  const apiUrl = localStorage.getItem('analyze_api_url') || DEFAULT_API_URL;
  const apiKey = localStorage.getItem('analyze_api_key') || '';
  const exaKey = localStorage.getItem('exa_api_key') || '';
  return { apiUrl, apiKey, exaKey };
}

export function setApiConfig(apiUrl: string, apiKey: string, exaKey?: string) {
  localStorage.setItem('analyze_api_url', apiUrl);
  localStorage.setItem('analyze_api_key', apiKey);
  if (exaKey !== undefined) {
    localStorage.setItem('exa_api_key', exaKey);
  }
}
