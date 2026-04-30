import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { getApiConfig, setApiConfig } from '../api/config';

export default function Settings() {
  const { dark, toggle } = useTheme();
  const config = getApiConfig();
  const [apiUrl, setApiUrl] = useState(config.apiUrl);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setApiConfig(apiUrl, apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">设置</h2>

      {/* 用户信息 */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">用户信息</h3>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
            U
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">投资者用户</p>
            <p className="text-sm text-gray-500">investor@example.com</p>
            <p className="text-xs text-gray-400 mt-1">账户创建于 2024年1月</p>
          </div>
        </div>
      </div>

      {/* 主题切换 */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">外观</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">深色模式</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">切换深色 / 浅色显示主题</p>
          </div>
          <button
            onClick={toggle}
            className={`relative w-14 h-7 rounded-full transition-colors ${dark ? 'bg-indigo-500' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${dark ? 'translate-x-7.5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>

      {/* API 配置 */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">AI 分析服务配置</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">服务地址</label>
            <input
              type="text"
              value={apiUrl}
              onChange={e => setApiUrl(e.target.value)}
              placeholder="如：https://your-server.com"
              className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">云端分析服务的 API 地址</p>
          </div>
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="输入您的 API Key"
              className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">用于鉴权的客户端密钥，与服务端 API_SECRET_KEY 一致</p>
          </div>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition"
          >
            {saved ? '已保存 ✓' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
  );
}
