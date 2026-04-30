"""持仓数据管理 - SQLite 存储"""
import sqlite3
import os
from contextlib import contextmanager
from typing import Optional
from pydantic import BaseModel

DB_PATH = os.path.join(os.path.dirname(__file__), "holdings.db")


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
    """初始化数据库表，如果为空则插入默认数据"""
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS holdings (
                code TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                buy_price REAL NOT NULL,
                current_price REAL NOT NULL
            )
        """)
        conn.commit()

        count = conn.execute("SELECT COUNT(*) FROM holdings").fetchone()[0]
        if count == 0:
            defaults = [
                ("苹果", "AAPL", 50, 178.50, 192.30),
                ("特斯拉", "TSLA", 30, 245.00, 231.80),
                ("英伟达", "NVDA", 20, 480.00, 520.50),
                ("微软", "MSFT", 40, 380.00, 415.20),
                ("谷歌", "GOOGL", 25, 140.00, 152.80),
                ("亚马逊", "AMZN", 35, 185.00, 178.50),
                ("腾讯", "0700.HK", 100, 320.00, 358.00),
                ("茅台", "600519", 5, 1680.00, 1720.50),
            ]
            conn.executemany(
                "INSERT INTO holdings (name, code, quantity, buy_price, current_price) VALUES (?, ?, ?, ?, ?)",
                defaults,
            )
            conn.commit()


def get_all_holdings() -> list[dict]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM holdings").fetchall()
        return [dict(r) for r in rows]


def add_holding(item: HoldingItem) -> dict:
    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO holdings (code, name, quantity, buy_price, current_price) VALUES (?, ?, ?, ?, ?)",
            (item.code, item.name, item.quantity, item.buy_price, item.current_price),
        )
        conn.commit()
    return item.model_dump()


def update_holding(code: str, data: HoldingUpdate) -> dict | None:
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        return None
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [code]
    with get_db() as conn:
        conn.execute(f"UPDATE holdings SET {set_clause} WHERE code = ?", values)
        conn.commit()
        row = conn.execute("SELECT * FROM holdings WHERE code = ?", (code,)).fetchone()
        return dict(row) if row else None


def delete_holding(code: str) -> bool:
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM holdings WHERE code = ?", (code,))
        conn.commit()
        return cursor.rowcount > 0


# ===== 现金管理（多币种） =====

CASH_CURRENCIES = ("CNY", "HKD", "USD")
CASH_DEFAULTS = {"CNY": 100000.0, "HKD": 0.0, "USD": 0.0}


def _init_cash_table(conn: sqlite3.Connection):
    # 检测是否存在旧表结构（id, amount），如有则迁移
    columns = [row[1] for row in conn.execute("PRAGMA table_info(cash)").fetchall()]
    if columns and 'currency' not in columns:
        # 旧表结构，保留人民币余额后删除重建
        old_amount = 0.0
        try:
            row = conn.execute("SELECT amount FROM cash WHERE id = 1").fetchone()
            if row:
                old_amount = row[0]
        except Exception:
            pass
        conn.execute("DROP TABLE cash")
        conn.commit()
        conn.execute("""
            CREATE TABLE cash (
                currency TEXT PRIMARY KEY,
                amount REAL NOT NULL DEFAULT 0
            )
        """)
        conn.commit()
        conn.execute("INSERT INTO cash (currency, amount) VALUES (?, ?)", ("CNY", old_amount))
        conn.execute("INSERT INTO cash (currency, amount) VALUES (?, ?)", ("HKD", 0.0))
        conn.execute("INSERT INTO cash (currency, amount) VALUES (?, ?)", ("USD", 0.0))
        conn.commit()
        return

    conn.execute("""
        CREATE TABLE IF NOT EXISTS cash (
            currency TEXT PRIMARY KEY,
            amount REAL NOT NULL DEFAULT 0
        )
    """)
    conn.commit()
    for cur in CASH_CURRENCIES:
        row = conn.execute("SELECT 1 FROM cash WHERE currency = ?", (cur,)).fetchone()
        if not row:
            conn.execute("INSERT INTO cash (currency, amount) VALUES (?, ?)", (cur, CASH_DEFAULTS[cur]))
    conn.commit()


def get_cash() -> dict[str, float]:
    """返回 {CNY: ..., HKD: ..., USD: ...}"""
    with get_db() as conn:
        _init_cash_table(conn)
        rows = conn.execute("SELECT currency, amount FROM cash").fetchall()
        result = {cur: 0.0 for cur in CASH_CURRENCIES}
        for r in rows:
            result[r[0]] = r[1]
        return result


def update_cash(currency: str, amount: float) -> dict[str, float]:
    """更新指定币种的现金余额，返回全部余额"""
    if currency not in CASH_CURRENCIES:
        raise ValueError(f"不支持的币种: {currency}")
    with get_db() as conn:
        _init_cash_table(conn)
        conn.execute("UPDATE cash SET amount = ? WHERE currency = ?", (amount, currency))
        conn.commit()
        rows = conn.execute("SELECT currency, amount FROM cash").fetchall()
        result = {cur: 0.0 for cur in CASH_CURRENCIES}
        for r in rows:
            result[r[0]] = r[1]
        return result


# ===== 资产快照 =====

def _init_snapshot_table(conn: sqlite3.Connection):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS asset_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL UNIQUE,
            total_cny REAL NOT NULL
        )
    """)
    conn.commit()


def add_asset_snapshot(date: str, total_cny: float):
    """记录某天的总资产快照（日期格式 YYYY-MM-DD），同一天覆盖"""
    with get_db() as conn:
        _init_snapshot_table(conn)
        conn.execute(
            "INSERT OR REPLACE INTO asset_snapshots (date, total_cny) VALUES (?, ?)",
            (date, total_cny),
        )
        conn.commit()


def get_asset_snapshots(limit: int = 90) -> list[dict]:
    """获取最近 N 天的资产快照，按日期升序"""
    with get_db() as conn:
        _init_snapshot_table(conn)
        rows = conn.execute(
            "SELECT date, total_cny FROM asset_snapshots ORDER BY date DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [{"date": r[0], "value": r[1]} for r in reversed(rows)]


# ===== 关注列表 =====

class WatchItem(BaseModel):
    code: str
    name: str


def _init_watchlist_table(conn: sqlite3.Connection):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS watchlist (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL
        )
    """)
    conn.commit()
    # 插入默认关注股票（仅首次）
    count = conn.execute("SELECT COUNT(*) FROM watchlist").fetchone()[0]
    if count == 0:
        defaults = [
            ("AAPL", "苹果"), ("TSLA", "特斯拉"), ("NVDA", "英伟达"),
            ("MSFT", "微软"), ("GOOGL", "谷歌"), ("AMZN", "亚马逊"),
            ("META", "Meta"), ("TSM", "台积电"),
            ("0700.HK", "腾讯"), ("600519", "茅台"),
            ("002594", "比亚迪"), ("300750", "宁德时代"),
        ]
        conn.executemany("INSERT INTO watchlist (code, name) VALUES (?, ?)", defaults)
        conn.commit()


def get_watchlist() -> list[dict]:
    with get_db() as conn:
        _init_watchlist_table(conn)
        rows = conn.execute("SELECT code, name FROM watchlist").fetchall()
        return [dict(r) for r in rows]


def add_watch(item: WatchItem) -> dict:
    with get_db() as conn:
        _init_watchlist_table(conn)
        conn.execute("INSERT OR REPLACE INTO watchlist (code, name) VALUES (?, ?)", (item.code, item.name))
        conn.commit()
    return item.model_dump()


def remove_watch(code: str) -> bool:
    with get_db() as conn:
        _init_watchlist_table(conn)
        cursor = conn.execute("DELETE FROM watchlist WHERE code = ?", (code,))
        conn.commit()
        return cursor.rowcount > 0
