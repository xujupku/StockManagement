import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import ChatDialog from './ChatDialog';

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
      <ChatDialog />
    </div>
  );
}
