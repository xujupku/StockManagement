/**
 * 轻量级用户操作日志采集模块
 * 自动捕获：点击事件、页面导航、JS 错误
 * 批量上报到后端 /api/activity-logs
 */

import { authFetch } from '../api/authFetch';

interface LogEntry {
  timestamp: string;
  event_type: string;
  page: string;
  target: string;
  detail: string;
}

const BATCH_SIZE = 20;
const FLUSH_INTERVAL = 10_000; // 10s

let buffer: LogEntry[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let initialized = false;

function now() {
  return new Date().toISOString();
}

function currentPage() {
  return location.pathname;
}

/** 添加一条日志到缓冲 */
export function log(event_type: string, target: string = '', detail: string = '') {
  buffer.push({
    timestamp: now(),
    event_type,
    page: currentPage(),
    target,
    detail,
  });
  if (buffer.length >= BATCH_SIZE) {
    flush();
  }
}

/** 将缓冲区日志批量发送到后端 */
export async function flush() {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0);
  try {
    await authFetch('/api/activity-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs: batch }),
    });
  } catch {
    // 发送失败时放回缓冲区，下次重试
    buffer.unshift(...batch);
  }
}

/** 捕获点击事件 */
function handleClick(e: MouseEvent) {
  const el = e.target as HTMLElement;
  if (!el) return;
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent || '').slice(0, 50).trim();
  const id = el.id ? `#${el.id}` : '';
  const cls = el.className && typeof el.className === 'string'
    ? '.' + el.className.split(' ').slice(0, 2).join('.')
    : '';
  const targetStr = `${tag}${id}${cls}`;
  // 只记录有意义的点击（按钮、链接、有 data-log 属性的）
  const isInteractive = ['a', 'button', 'input', 'select', 'textarea'].includes(tag)
    || el.closest('button, a, [data-log]')
    || el.getAttribute('role') === 'button';
  if (!isInteractive) return;
  log('click', targetStr, text);
}

/** 捕获 JS 错误 */
function handleError(e: ErrorEvent) {
  log('error', e.filename || '', `${e.message} (line ${e.lineno})`);
}

function handleUnhandledRejection(e: PromiseRejectionEvent) {
  const msg = e.reason?.message || String(e.reason);
  log('unhandled_rejection', '', msg.slice(0, 200));
}

/** 捕获页面可见性变化（离开/回来） */
function handleVisibility() {
  if (document.hidden) {
    log('page_hide', '', currentPage());
    flush(); // 离开页面时立刻上报
  } else {
    log('page_show', '', currentPage());
  }
}

/** 初始化日志采集 */
export function initActivityLogger() {
  if (initialized) return;
  initialized = true;

  // 点击
  document.addEventListener('click', handleClick, true);
  // 错误
  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
  // 可见性
  document.addEventListener('visibilitychange', handleVisibility);
  // 页面卸载前 flush
  window.addEventListener('beforeunload', () => flush());

  // 定时 flush
  flushTimer = setInterval(flush, FLUSH_INTERVAL);

  // 记录首次加载
  log('page_view', '', currentPage());
}

/** 销毁日志采集（通常不需要调用） */
export function destroyActivityLogger() {
  if (!initialized) return;
  initialized = false;
  document.removeEventListener('click', handleClick, true);
  window.removeEventListener('error', handleError);
  window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  document.removeEventListener('visibilitychange', handleVisibility);
  if (flushTimer) clearInterval(flushTimer);
  flush();
}

/**
 * 路由变化时记录页面导航
 * 在路由组件中调用此方法
 */
export function logNavigation(path: string) {
  log('navigation', path, '');
}
