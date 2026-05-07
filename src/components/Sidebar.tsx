import { useState, useRef, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'sidebar-nav-order';

const defaultNavItems = [
  { to: '/', label: '仪表盘', icon: '📊' },
  { to: '/portfolio', label: '我的持仓', icon: '💼' },
  { to: '/chat', label: 'AI咨询', icon: '💬' },
  { to: '/advisor', label: '持仓分析', icon: '🤖' },
  { to: '/picker', label: 'AI推股', icon: '🎯' },
  { to: '/market', label: '市场行情', icon: '📈' },
  { to: '/settings', label: '设置', icon: '⚙️' },
];

// 从 localStorage 读取保存的顺序，并据此排列导航项
function getStoredNavItems() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const order: string[] = JSON.parse(stored);
      const sorted = [...defaultNavItems].sort((a, b) => {
        const idxA = order.indexOf(a.to);
        const idxB = order.indexOf(b.to);
        // 如果某项不在已存储的顺序中，放到末尾
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });
      return sorted;
    }
  } catch {
    // 解析失败时使用默认顺序
  }
  return defaultNavItems;
}

export default function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { dark } = useTheme();
  const { user, logout } = useAuth();
  const [navItems, setNavItems] = useState(getStoredNavItems);

  // 当前正在拖拽的项目索引
  const dragIndexRef = useRef<number | null>(null);
  // 当前拖拽悬停的目标索引
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // 拖拽开始
  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);

  // 拖拽经过目标项
  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  // 拖拽离开目标项
  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  // 放置完成，重新排列并持久化
  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);

    const dragIndex = dragIndexRef.current;
    if (dragIndex === null || dragIndex === dropIndex) return;

    setNavItems(prev => {
      const updated = [...prev];
      const [dragged] = updated.splice(dragIndex, 1);
      updated.splice(dropIndex, 0, dragged);

      // 保存新顺序到 localStorage
      const order = updated.map(item => item.to);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(order));

      return updated;
    });

    dragIndexRef.current = null;
  }, []);

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }, []);

  return (
    <aside className={`
      w-64 shrink-0 h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col
      fixed md:sticky top-0 z-50 transition-transform duration-300
      ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
    `}>
      <div className="px-6 py-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <span className="text-2xl">🤖</span>
          <span>AI股票投资管家</span>
        </h1>
        {/* 移动端关闭按钮 */}
        <button
          onClick={onClose}
          className="md:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item, index) => (
          <div
            key={item.to}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={`group relative rounded-xl transition-all ${
              dragOverIndex === index
                ? 'ring-2 ring-indigo-400 dark:ring-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/5'
                : ''
            }`}
          >
            {/* 拖拽手柄，hover 时显示 */}
            <span className="absolute left-1 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-xs select-none">
              ⠿
            </span>
            <NavLink
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
          </div>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3 px-3">
          <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-bold">
            {user?.nickname?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.nickname || '游客'}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email || (dark ? '深色模式' : '浅色模式')}</p>
          </div>
          {user && (
            <button
              onClick={logout}
              title="退出登录"
              className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
