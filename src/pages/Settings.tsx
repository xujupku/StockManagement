import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { getApiConfig, setApiConfig } from '../api/config';

export default function Settings() {
  const { dark, toggle } = useTheme();
  const { user, logout } = useAuth();
  const config = getApiConfig();
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [exaKey, setExaKey] = useState(config.exaKey);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setApiConfig(config.apiUrl, apiKey, exaKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-4">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">设置</h2>

      {/* 用户信息 */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">用户信息</h3>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl md:text-2xl font-bold">
            {user?.nickname?.[0]?.toUpperCase() || 'U'}
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">{user?.nickname || '游客'}</p>
            <p className="text-sm text-gray-500">{user?.email || '未登录'}</p>
            {user?.id && user.id !== 'default' && (
              <p className="text-xs text-gray-400 mt-1">用户 ID: {user.id}</p>
            )}
          </div>
        </div>
      </div>

      {/* 主题切换 */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">外观</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">深色模式</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">切换深色 / 浅色显示主题</p>
          </div>
          <button
            onClick={toggle}
            type="button"
            aria-label="切换深色模式"
            aria-pressed={dark}
            className={`relative inline-flex h-9 w-16 shrink-0 items-center rounded-full p-1 transition-all duration-300 ${
              dark
                ? 'bg-gradient-to-r from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/25'
                : 'bg-gray-200 ring-1 ring-inset ring-gray-300'
            }`}
          >
            <span
              className={`absolute left-2 text-[11px] font-semibold transition-all duration-300 ${
                dark ? 'opacity-0 -translate-x-1' : 'opacity-100 translate-x-0 text-gray-500'
              }`}
            >
              OFF
            </span>
            <span
              className={`absolute right-2 text-[11px] font-semibold transition-all duration-300 ${
                dark ? 'opacity-100 translate-x-0 text-white/90' : 'opacity-0 translate-x-1'
              }`}
            >
              ON
            </span>
            <span
              className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-[0_3px_10px_rgba(15,23,42,0.18)] transition-transform duration-300"
              style={{ transform: dark ? 'translateX(1.75rem)' : 'translateX(0)' }}
            >
              {dark ? (
                <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646a9 9 0 1011.708 11.708z" />
                </svg>
              ) : (
                <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25M12 18.75V21M4.97 4.97l1.591 1.591M17.439 17.439l1.591 1.591M3 12h2.25M18.75 12H21M4.97 19.03l1.591-1.591M17.439 6.561l1.591-1.591M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              )}
            </span>
          </button>
        </div>
      </div>

      {/* API Key 配置 */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">AI 模型配置</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">DeepSeek API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-... (留空则使用系统默认)"
              className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              设置您自己的 DeepSeek API Key 后，AI 分析将使用您的额度。留空则使用系统提供的共享额度。获取密钥：<a href="https://platform.deepseek.com/api_keys" target="_blank" className="text-indigo-500 hover:underline">platform.deepseek.com</a>
            </p>
          </div>
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">Exa API Key</label>
            <input
              type="password"
              value={exaKey}
              onChange={e => setExaKey(e.target.value)}
              placeholder="... (留空则使用系统默认)"
              className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              用于 AI 选股和持仓分析中的网络搜索功能。获取密钥：<a href="https://exa.ai" target="_blank" className="text-indigo-500 hover:underline">exa.ai</a>
            </p>
          </div>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition"
          >
            {saved ? '已保存 ✓' : '保存配置'}
          </button>
        </div>
      </div>

      <button
        onClick={logout}
        className="w-full px-4 py-3 rounded-2xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-500/15 transition"
      >
        {user?.id === 'default' ? '退出游客模式' : '退出登录'}
      </button>
    </div>
  );
}
