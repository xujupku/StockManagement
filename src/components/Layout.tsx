import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { initActivityLogger, logNavigation } from '../utils/activityLogger';

export default function Layout() {
  const location = useLocation();

  useEffect(() => {
    initActivityLogger();
  }, []);

  useEffect(() => {
    logNavigation(location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
