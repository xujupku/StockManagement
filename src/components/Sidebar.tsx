import { NavLink } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

const navItems = [
  { to: '/', label: '仪表盘', icon: '📊' },
  { to: '/portfolio', label: '我的持仓', icon: '💼' },
  { to: '/advisor', label: '投资分析', icon: '🤖' },
  { to: '/picker', label: 'AI推股', icon: '🎯' },
  { to: '/market', label: '市场行情', icon: '📈' },
  { to: '/settings', label: '设置', icon: '⚙️' },
];

export default function Sidebar() {
  const { dark } = useTheme();

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
      <div className="px-6 py-6 border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <span className="text-2xl">🤖</span>
          <span>AI股票投资管家</span>
        </h1>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`
            }
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3 px-3">
          <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-bold">
            U
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">投资者</p>
            <p className="text-xs text-gray-500">{dark ? '深色模式' : '浅色模式'}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
