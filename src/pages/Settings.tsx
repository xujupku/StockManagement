import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { getApiConfig, setApiConfig } from '../api/config';
import { authFetch } from '../api/authFetch';

interface LogEntry {
  id: number;
  timestamp: string;
  event_type: string;
  page: string;
  target: string;
  detail: string;
}

interface LogStats {
  total: number;
  by_type: { event_type: string; cnt: number }[];
  by_page: { page: string; cnt: number }[];
}

const EVENT_LABELS: Record<string, string> = {
  click: '点击',
  navigation: '导航',
  page_view: '页面访问',
  page_hide: '离开页面',
  page_show: '返回页面',
  error: 'JS 错误',
  unhandled_rejection: '未处理异常',
};

export default function Settings() {
  const { dark, toggle } = useTheme();
  const { user } = useAuth();
  const config = getApiConfig();
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [exaKey, setExaKey] = useState(config.exaKey);
  const [saved, setSaved] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [logTab, setLogTab] = useState<'logs' | 'stats'>('logs');
  const [logFilter, setLogFilter] = useState({ event_type: '', page: '' });
  const [logLoading, setLogLoading] = useState(false);

  const handleSave = () => {
    setApiConfig(config.apiUrl, apiKey, exaKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const fetchLogs = useCallback(async () => {
    setLogLoading(true);
    try {
      const params = new URLSearchParams();
      if (logFilter.event_type) params.set('event_type', logFilter.event_type);
      if (logFilter.page) params.set('page', logFilter.page);
      params.set('limit', '200');
      const res = await authFetch(`/api/activity-logs?${params}`);
      if (res.ok) setLogs(await res.json());
    } finally {
      setLogLoading(false);
    }
  }, [logFilter]);

  const fetchStats = useCallback(async () => {
    const res = await authFetch('/api/activity-logs/stats');
    if (res.ok) setStats(await res.json());
  }, []);

  useEffect(() => {
    if (!showLogs) return;
    if (logTab === 'logs') fetchLogs();
    else fetchStats();
  }, [showLogs, logTab, fetchLogs, fetchStats]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
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
            className={`relative w-14 h-7 rounded-full transition-colors ${dark ? 'bg-indigo-500' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${dark ? 'translate-x-7.5' : 'translate-x-0.5'}`} />
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
              设置您自己的 DeepSeek API Key 后，AI 分析将使用您的额度。留空则使用系统提供的共享额度。
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

      {/* 操作日志 */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">操作日志</h3>
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="text-xs text-indigo-500 hover:text-indigo-600 transition"
          >
            {showLogs ? '收起' : '展开查看'}
          </button>
        </div>

        {showLogs && (
          <div className="space-y-3">
            {/* Tab 切换 */}
            <div className="flex gap-2">
              <button
                onClick={() => setLogTab('logs')}
                className={`px-3 py-1 text-xs rounded-md transition ${logTab === 'logs' ? 'bg-indigo-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}
              >
                日志列表
              </button>
              <button
                onClick={() => setLogTab('stats')}
                className={`px-3 py-1 text-xs rounded-md transition ${logTab === 'stats' ? 'bg-indigo-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}
              >
                统计概览
              </button>
            </div>

            {logTab === 'logs' && (
              <>
                {/* 筛选栏 */}
                <div className="flex gap-2 flex-wrap">
                  <select
                    value={logFilter.event_type}
                    onChange={(e) => setLogFilter(f => ({ ...f, event_type: e.target.value }))}
                    className="text-xs border rounded-md px-2 py-1 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
                  >
                    <option value="">全部类型</option>
                    <option value="click">点击</option>
                    <option value="navigation">导航</option>
                    <option value="page_view">页面访问</option>
                    <option value="error">错误</option>
                    <option value="unhandled_rejection">未处理异常</option>
                  </select>
                  <input
                    type="text"
                    placeholder="按页面筛选..."
                    value={logFilter.page}
                    onChange={(e) => setLogFilter(f => ({ ...f, page: e.target.value }))}
                    className="text-xs border rounded-md px-2 py-1 w-32 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
                  />
                  <button
                    onClick={fetchLogs}
                    className="text-xs px-3 py-1 bg-indigo-500 text-white rounded-md hover:bg-indigo-600 transition"
                  >
                    刷新
                  </button>
                </div>

                {/* 日志表格 */}
                <div className="max-h-80 overflow-auto border rounded-lg dark:border-gray-700">
                  {logLoading ? (
                    <div className="p-4 text-center text-gray-400 text-sm">加载中...</div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400">时间</th>
                          <th className="text-left px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400">类型</th>
                          <th className="text-left px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400">页面</th>
                          <th className="text-left px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400">目标</th>
                          <th className="text-left px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400">详情</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {logs.map((l) => (
                          <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-2 py-1.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                              {new Date(l.timestamp).toLocaleString('zh-CN', { hour12: false })}
                            </td>
                            <td className="px-2 py-1.5">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                l.event_type === 'error' || l.event_type === 'unhandled_rejection'
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                  : l.event_type === 'click'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                              }`}>
                                {EVENT_LABELS[l.event_type] || l.event_type}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-gray-600 dark:text-gray-300">{l.page}</td>
                            <td className="px-2 py-1.5 text-gray-500 dark:text-gray-400 max-w-[120px] truncate">{l.target}</td>
                            <td className="px-2 py-1.5 text-gray-500 dark:text-gray-400 max-w-[160px] truncate">{l.detail}</td>
                          </tr>
                        ))}
                        {logs.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-2 py-6 text-center text-gray-400">暂无日志记录</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}

            {logTab === 'stats' && stats && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">日志总量</div>
                  <div className="text-xl font-bold text-gray-800 dark:text-gray-100">{stats.total.toLocaleString()}</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">事件类型数</div>
                  <div className="text-xl font-bold text-gray-800 dark:text-gray-100">{stats.by_type.length}</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 col-span-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">按事件类型</div>
                  <div className="space-y-1">
                    {stats.by_type.map((t) => (
                      <div key={t.event_type} className="flex justify-between text-xs">
                        <span className="text-gray-600 dark:text-gray-300">{EVENT_LABELS[t.event_type] || t.event_type}</span>
                        <span className="font-medium text-gray-800 dark:text-gray-100">{t.cnt}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 col-span-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">热门页面</div>
                  <div className="space-y-1">
                    {stats.by_page.map((p) => (
                      <div key={p.page} className="flex justify-between text-xs">
                        <span className="text-gray-600 dark:text-gray-300">{p.page || '(空)'}</span>
                        <span className="font-medium text-gray-800 dark:text-gray-100">{p.cnt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {logTab === 'stats' && !stats && (
              <div className="text-center text-gray-400 text-sm py-4">加载中...</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
