"""持仓数据管理 - SQLite 存储（支持用户隔离）"""
import sqlite3
from contextlib import contextmanager
from typing import Optional
from pydantic import BaseModel
from db_paths import get_db_path

DB_PATH = get_db_path("holdings.db")


class HoldingItem(BaseModel):
    name: str
    code: str
    quantity: int
    buy_price: float
    current_price: float


class HoldingUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[int] = None
    buy_price: Optional[float] = None
    current_price: Optional[float] = None


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    """初始化数据库表（含用户隔离支持）"""
    with get_db() as conn:
        # 新结构：含 user_id
        conn.execute("""
            CREATE TABLE IF NOT EXISTS holdings (
                code TEXT NOT NULL,
                name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                buy_price REAL NOT NULL,
                current_price REAL NOT NULL,
                user_id TEXT NOT NULL DEFAULT 'default',
                PRIMARY KEY (code, user_id)
            )
        """)
        conn.commit()

        # 迁移：旧表无 user_id 列时添加
        columns = [row[1] for row in conn.execute("PRAGMA table_info(holdings)").fetchall()]
        if 'user_id' not in columns:
            conn.execute("ALTER TABLE holdings ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'")
            conn.commit()
            # 重建主键（需要新表）
            conn.executescript("""
                CREATE TABLE holdings_new (
                    code TEXT NOT NULL,
                    name TEXT NOT NULL,
                    quantity INTEGER NOT NULL,
                    buy_price REAL NOT NULL,
                    current_price REAL NOT NULL,
                    user_id TEXT NOT NULL DEFAULT 'default',
                    PRIMARY KEY (code, user_id)
                );
                INSERT INTO holdings_new SELECT code, name, quantity, buy_price, current_price, 'default' FROM holdings;
                DROP TABLE holdings;
                ALTER TABLE holdings_new RENAME TO holdings;
            """)

        # 新用户不插入默认持仓数据
        conn.commit()


def get_all_holdings(user_id: str = "default") -> list[dict]:
    with get_db() as conn:
        rows = conn.execute("SELECT code, name, quantity, buy_price, current_price FROM holdings WHERE user_id = ?", (user_id,)).fetchall()
        return [dict(r) for r in rows]


def add_holding(item: HoldingItem, user_id: str = "default") -> dict:
    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO holdings (code, name, quantity, buy_price, current_price, user_id) VALUES (?, ?, ?, ?, ?, ?)",
            (item.code, item.name, item.quantity, item.buy_price, item.current_price, user_id),
        )
        conn.commit()
    return item.model_dump()


def update_holding(code: str, data: HoldingUpdate, user_id: str = "default") -> dict | None:
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        return None
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [code, user_id]
    with get_db() as conn:
        conn.execute(f"UPDATE holdings SET {set_clause} WHERE code = ? AND user_id = ?", values)
        conn.commit()
        row = conn.execute("SELECT code, name, quantity, buy_price, current_price FROM holdings WHERE code = ? AND user_id = ?", (code, user_id)).fetchone()
        return dict(row) if row else None


def delete_holding(code: str, user_id: str = "default") -> bool:
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM holdings WHERE code = ? AND user_id = ?", (code, user_id))
        conn.commit()
        return cursor.rowcount > 0


# ===== 现金管理（多币种，支持用户隔离） =====

CASH_CURRENCIES = ("CNY", "HKD", "USD")
CASH_DEFAULTS = {"CNY": 0.0, "HKD": 0.0, "USD": 0.0}


def _init_cash_table(conn: sqlite3.Connection):
    # 检查旧表结构
    columns = [row[1] for row in conn.execute("PRAGMA table_info(cash)").fetchall()]

    if columns and 'user_id' not in columns:
        # 旧表无 user_id，迁移
        old_data = []
        try:
            rows = conn.execute("SELECT currency, amount FROM cash").fetchall()
            old_data = [(r[0], r[1]) for r in rows]
        except Exception:
            pass
        conn.execute("DROP TABLE IF EXISTS cash")
        conn.commit()
        conn.execute("""
            CREATE TABLE cash (
                currency TEXT NOT NULL,
                amount REAL NOT NULL DEFAULT 0,
                user_id TEXT NOT NULL DEFAULT 'default',
                PRIMARY KEY (currency, user_id)
            )
        """)
        conn.commit()
        for cur, amt in old_data:
            conn.execute("INSERT INTO cash (currency, amount, user_id) VALUES (?, ?, 'default')", (cur, amt))
        conn.commit()
        return

    if not columns:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cash (
                currency TEXT NOT NULL,
                amount REAL NOT NULL DEFAULT 0,
                user_id TEXT NOT NULL DEFAULT 'default',
                PRIMARY KEY (currency, user_id)
            )
        """)
        conn.commit()


def _ensure_cash_defaults(conn: sqlite3.Connection, user_id: str):
    """确保用户有默认现金记录"""
    for cur in CASH_CURRENCIES:
        row = conn.execute("SELECT 1 FROM cash WHERE currency = ? AND user_id = ?", (cur, user_id)).fetchone()
        if not row:
            conn.execute("INSERT INTO cash (currency, amount, user_id) VALUES (?, ?, ?)", (cur, CASH_DEFAULTS[cur], user_id))
    conn.commit()


def get_cash(user_id: str = "default") -> dict[str, float]:
    """返回 {CNY: ..., HKD: ..., USD: ...}"""
    with get_db() as conn:
        _init_cash_table(conn)
        _ensure_cash_defaults(conn, user_id)
        rows = conn.execute("SELECT currency, amount FROM cash WHERE user_id = ?", (user_id,)).fetchall()
        result = {cur: 0.0 for cur in CASH_CURRENCIES}
        for r in rows:
            result[r[0]] = r[1]
        return result


def update_cash(currency: str, amount: float, user_id: str = "default") -> dict[str, float]:
    """更新指定币种的现金余额，返回全部余额"""
    if currency not in CASH_CURRENCIES:
        raise ValueError(f"不支持的币种: {currency}")
    with get_db() as conn:
        _init_cash_table(conn)
        _ensure_cash_defaults(conn, user_id)
        conn.execute("UPDATE cash SET amount = ? WHERE currency = ? AND user_id = ?", (amount, currency, user_id))
        conn.commit()
        rows = conn.execute("SELECT currency, amount FROM cash WHERE user_id = ?", (user_id,)).fetchall()
        result = {cur: 0.0 for cur in CASH_CURRENCIES}
        for r in rows:
            result[r[0]] = r[1]
        return result


# ===== 资产快照 =====

def _init_snapshot_table(conn: sqlite3.Connection):
    columns = [row[1] for row in conn.execute("PRAGMA table_info(asset_snapshots)").fetchall()]
    if columns and 'user_id' not in columns:
        conn.execute("ALTER TABLE asset_snapshots ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'")
        conn.commit()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS asset_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            total_cny REAL NOT NULL,
            user_id TEXT NOT NULL DEFAULT 'default',
            UNIQUE(date, user_id)
        )
    """)
    conn.commit()


def add_asset_snapshot(date: str, total_cny: float, user_id: str = "default"):
    """记录某天的总资产快照"""
    with get_db() as conn:
        _init_snapshot_table(conn)
        conn.execute(
            "INSERT OR REPLACE INTO asset_snapshots (date, total_cny, user_id) VALUES (?, ?, ?)",
            (date, total_cny, user_id),
        )
        conn.commit()


def get_asset_snapshots(limit: int = 90, user_id: str = "default") -> list[dict]:
    """获取最近 N 天的资产快照"""
    with get_db() as conn:
        _init_snapshot_table(conn)
        rows = conn.execute(
            "SELECT date, total_cny FROM asset_snapshots WHERE user_id = ? ORDER BY date DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
        return [{"date": r[0], "value": r[1]} for r in reversed(rows)]


# ===== 关注列表 =====

class WatchItem(BaseModel):
    code: str
    name: str


def _init_watchlist_table(conn: sqlite3.Connection):
    columns = [row[1] for row in conn.execute("PRAGMA table_info(watchlist)").fetchall()]
    if columns and 'user_id' not in columns:
        conn.execute("ALTER TABLE watchlist ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'")
        conn.commit()
        # 重建主键
        conn.executescript("""
            CREATE TABLE watchlist_new (
                code TEXT NOT NULL,
                name TEXT NOT NULL,
                user_id TEXT NOT NULL DEFAULT 'default',
                PRIMARY KEY (code, user_id)
            );
            INSERT OR IGNORE INTO watchlist_new SELECT code, name, 'default' FROM watchlist;
            DROP TABLE watchlist;
            ALTER TABLE watchlist_new RENAME TO watchlist;
        """)
        return

    conn.execute("""
        CREATE TABLE IF NOT EXISTS watchlist (
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            user_id TEXT NOT NULL DEFAULT 'default',
            PRIMARY KEY (code, user_id)
        )
    """)
    conn.commit()


def _ensure_watchlist_defaults(conn: sqlite3.Connection, user_id: str):
    # 新用户不插入默认关注列表
    pass


def get_watchlist(user_id: str = "default") -> list[dict]:
    with get_db() as conn:
        _init_watchlist_table(conn)
        _ensure_watchlist_defaults(conn, user_id)
        rows = conn.execute("SELECT code, name FROM watchlist WHERE user_id = ?", (user_id,)).fetchall()
        return [dict(r) for r in rows]


def add_watch(item: WatchItem, user_id: str = "default") -> dict:
    with get_db() as conn:
        _init_watchlist_table(conn)
        conn.execute("INSERT OR REPLACE INTO watchlist (code, name, user_id) VALUES (?, ?, ?)", (item.code, item.name, user_id))
        conn.commit()
    return item.model_dump()


def remove_watch(code: str, user_id: str = "default") -> bool:
    with get_db() as conn:
        _init_watchlist_table(conn)
        cursor = conn.execute("DELETE FROM watchlist WHERE code = ? AND user_id = ?", (code, user_id))
        conn.commit()
        return cursor.rowcount > 0
