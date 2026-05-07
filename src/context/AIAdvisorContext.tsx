import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from 'react';
import { useStocks } from './StockContext';
import { analyzePortfolio, PREFERENCE_OPTIONS, type InvestPreferences, type AnalyzeResult } from '../api/analyze';
import { authFetch } from '../api/authFetch';

interface AIAdvisorContextType {
  runningConvId: string | null;
  runningProgress: string;
  currentConvId: string | null;
  result: AnalyzeResult | null;
  error: string | null;
  progressText: string;
  startAnalysis: (prefs: InvestPreferences) => Promise<void>;
  stopAnalysis: () => void;
  clearResult: () => void;
  loadHistoryResult: (convId: string, result: AnalyzeResult) => void;
  switchToRunning: () => void;
}

const AIAdvisorContext = createContext<AIAdvisorContextType>(null!);

const CONV_TYPE = 'advisor';

function prefLabel(group: string, value: string): string {
  const opt = PREFERENCE_OPTIONS[group as keyof typeof PREFERENCE_OPTIONS]?.options?.find((o: any) => o.value === value);
  return opt?.label || value;
}

export function AIAdvisorProvider({ children }: { children: ReactNode }) {
  const { holdings } = useStocks();

  const [runningConvId, setRunningConvId] = useState<string | null>(null);
  const [runningProgress, setRunningProgress] = useState('');

  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressText, setProgressText] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const fullTextRef = useRef('');
  const prefsRef = useRef<InvestPreferences | null>(null);

  const startAnalysis = useCallback(async (prefs: InvestPreferences) => {
    if (prefs.factors.length === 0) {
      setError('请至少选择一个关注因素');
      return;
    }

    setError(null);
    fullTextRef.current = '';
    prefsRef.current = prefs;

    let convId: string | null = null;
    try {
      const res = await authFetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '新分析', type: CONV_TYPE }),
      });
      const data = await res.json();
      convId = data.id;
    } catch {
      setError('创建会话失败');
      return;
    }

    setRunningConvId(convId);
    setRunningProgress('');
    setCurrentConvId(convId);
    setResult(null);
    setProgressText('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await analyzePortfolio(holdings, prefs, {
        onProgress: (text) => {
          fullTextRef.current = text;
          setRunningProgress(text);
          if (currentConvId === convId || currentConvId === null) {
            setProgressText(text);
          }
        },
        signal: controller.signal,
      });

      if (currentConvId === convId) {
        setResult(res);
      }

      if (convId) {
        await saveResult(convId, prefs, res, fullTextRef.current, holdings);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setRunningProgress(prev => prev + '\n\n[已停止分析]');
        if (currentConvId === convId) {
          setProgressText(prev => prev + '\n\n[已停止分析]');
        }
      } else {
        if (currentConvId === convId) {
          setError(e.message || '分析请求失败');
        }
      }
    } finally {
      setRunningConvId(null);
      abortRef.current = null;
    }
  }, [holdings, currentConvId]);

  const stopAnalysis = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearResult = useCallback(() => {
    setCurrentConvId(null);
    setResult(null);
    setError(null);
    setProgressText('');
  }, []);

  const loadHistoryResult = useCallback((convId: string, historyResult: AnalyzeResult) => {
    setCurrentConvId(convId);
    setResult(historyResult);
    setError(null);
    if (convId === runningConvId) {
      setProgressText(runningProgress);
    } else {
      setProgressText('');
    }
  }, [runningConvId, runningProgress]);

  const switchToRunning = useCallback(() => {
    if (runningConvId) {
      setCurrentConvId(runningConvId);
      setResult(null);
      setError(null);
      setProgressText(runningProgress);
    }
  }, [runningConvId, runningProgress]);

  return (
    <AIAdvisorContext.Provider value={{
      runningConvId, runningProgress,
      currentConvId, result, error, progressText,
      startAnalysis, stopAnalysis, clearResult, loadHistoryResult, switchToRunning,
    }}>
      {children}
    </AIAdvisorContext.Provider>
  );
}

async function saveResult(convId: string, prefs: InvestPreferences, _result: AnalyzeResult, fullText: string, holdings: any[]) {
  const userQuery = buildUserQuery(prefs, holdings);

  await authFetch(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'user', content: userQuery }),
  });
  await authFetch(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'assistant', content: fullText }),
  });
  const title = userQuery.slice(0, 20) + (userQuery.length > 20 ? '...' : '');
  await authFetch(`/api/conversations/${convId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

function buildUserQuery(prefs: InvestPreferences, holdings: any[]): string {
  const prefSummary = [
    `风险偏好: ${prefLabel('riskTolerance', prefs.riskTolerance)}`,
    `投资期限: ${prefLabel('horizon', prefs.horizon)}`,
    `投资目标: ${prefLabel('goal', prefs.goal)}`,
    `关注因素: ${prefs.factors.map(f => prefLabel('factors', f)).join('、')}`,
    `集中度偏好: ${prefLabel('concentration', prefs.concentration)}`,
    `止损策略: ${prefLabel('stopLoss', prefs.stopLoss)}`,
  ].join('\n');
  return `持仓分析请求\n${prefSummary}\n\n当前持仓: ${holdings.map((h: any) => `${h.code}(${h.name})`).join(', ')}`;
}

export const useAIAdvisor = () => useContext(AIAdvisorContext);
