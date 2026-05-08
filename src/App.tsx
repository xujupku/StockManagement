import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { StockProvider } from './context/StockContext';
import { AIAdvisorProvider } from './context/AIAdvisorContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Portfolio from './pages/Portfolio';
import AIAdvisor from './pages/AIAdvisor';
import AIStockPicker from './pages/AIStockPicker';
import Chat from './pages/Chat';
import Market from './pages/Market';
import Settings from './pages/Settings';
import Login from './pages/Login';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="flex items-center justify-center bg-slate-50 dark:bg-gray-950"
        style={{ minHeight: '100dvh' }}
      >
        <div className="text-gray-400 text-sm">加载中...</div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <StockProvider>
      <AIAdvisorProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/advisor" element={<AIAdvisor />} />
            <Route path="/picker" element={<AIStockPicker />} />
            <Route path="/market" element={<Market />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </AIAdvisorProvider>
    </StockProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
