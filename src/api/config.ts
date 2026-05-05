const DEFAULT_API_URL = 'http://localhost:8000';

export function getApiConfig() {
  // 从 localStorage 读取用户在设置页配置的值
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
