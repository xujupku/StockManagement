"""用户操作日志存储模块"""
import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), 'activity_log.db')


def init_activity_log_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT 'default',
            timestamp TEXT NOT NULL,
            event_type TEXT NOT NULL,
            page TEXT,
            target TEXT,
            detail TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_logs_user_time
        ON activity_logs(user_id, timestamp DESC)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_logs_type
        ON activity_logs(event_type)
    """)
    conn.commit()
    conn.close()


def insert_logs(logs: list, user_id: str = 'default'):
    """批量插入日志"""
    conn = sqlite3.connect(DB_PATH)
    conn.executemany(
        """INSERT INTO activity_logs (user_id, timestamp, event_type, page, target, detail)
           VALUES (?, ?, ?, ?, ?, ?)""",
        [(user_id, log['timestamp'], log['event_type'], log.get('page', ''),
          log.get('target', ''), log.get('detail', '')) for log in logs]
    )
    conn.commit()
    conn.close()


def query_logs(user_id: str = None, event_type: str = None,
               page: str = None, limit: int = 100, offset: int = 0):
    """查询日志"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    sql = "SELECT * FROM activity_logs WHERE 1=1"
    params = []
    if user_id:
        sql += " AND user_id = ?"
        params.append(user_id)
    if event_type:
        sql += " AND event_type = ?"
        params.append(event_type)
    if page:
        sql += " AND page LIKE ?"
        params.append(f"%{page}%")
    sql += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_log_stats(user_id: str = None):
    """获取日志统计"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    where = "WHERE user_id = ?" if user_id else ""
    params = [user_id] if user_id else []

    total = conn.execute(f"SELECT COUNT(*) as cnt FROM activity_logs {where}", params).fetchone()['cnt']
    types = conn.execute(
        f"SELECT event_type, COUNT(*) as cnt FROM activity_logs {where} GROUP BY event_type ORDER BY cnt DESC",
        params
    ).fetchall()
    pages = conn.execute(
        f"SELECT page, COUNT(*) as cnt FROM activity_logs {where} GROUP BY page ORDER BY cnt DESC LIMIT 10",
        params
    ).fetchall()
    conn.close()
    return {
        'total': total,
        'by_type': [dict(r) for r in types],
        'by_page': [dict(r) for r in pages],
    }


# 初始化
init_activity_log_db()
