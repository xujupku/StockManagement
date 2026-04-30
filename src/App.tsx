import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { StockProvider } from './context/StockContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Portfolio from './pages/Portfolio';
import AIAdvisor from './pages/AIAdvisor';
import AIStockPicker from './pages/AIStockPicker';
import Market from './pages/Market';
import Settings from './pages/Settings';

export default function App() {
  return (
    <ThemeProvider>
      <StockProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/advisor" element={<AIAdvisor />} />
              <Route path="/picker" element={<AIStockPicker />} />
              <Route path="/market" element={<Market />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </StockProvider>
    </ThemeProvider>
  );
}
