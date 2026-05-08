import sqlite3
import uuid
import json
from datetime import datetime
from db_paths import get_db_path

DB_PATH = get_db_path("chat.db")


def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_chat_db():
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT '新对话',
            type TEXT NOT NULL DEFAULT 'chat',
            user_id TEXT NOT NULL DEFAULT 'default',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
    """)

    # 迁移：给旧表添加 type 字段
    try:
        conn.execute("ALTER TABLE conversations ADD COLUMN type TEXT NOT NULL DEFAULT 'chat'")
        conn.commit()
    except sqlite3.OperationalError:
        pass

    # 迁移：给旧表添加 user_id 字段
    try:
        conn.execute("ALTER TABLE conversations ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'")
        conn.commit()
    except sqlite3.OperationalError:
        pass

    # 迁移：给旧表添加 hermes_messages 字段
    try:
        conn.execute("ALTER TABLE conversations ADD COLUMN hermes_messages TEXT")
        conn.commit()
    except sqlite3.OperationalError:
        pass

    conn.execute("CREATE INDEX IF NOT EXISTS idx_conv_type ON conversations(type)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id)")
    conn.commit()
    conn.close()


def create_conversation(title: str = "新对话", conv_type: str = "chat", user_id: str = "default") -> dict:
    conn = _get_conn()
    conv_id = uuid.uuid4().hex[:12]
    now = datetime.now().isoformat()
    conn.execute(
        "INSERT INTO conversations (id, title, type, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (conv_id, title, conv_type, user_id, now, now),
    )
    conn.commit()
    conn.close()
    return {"id": conv_id, "title": title, "type": conv_type, "user_id": user_id, "created_at": now, "updated_at": now}


def list_conversations(conv_type: str | None = None, user_id: str = "default", limit: int = 50) -> list:
    conn = _get_conn()
    if conv_type:
        rows = conn.execute(
            "SELECT * FROM conversations WHERE type = ? AND user_id = ? ORDER BY updated_at DESC LIMIT ?",
            (conv_type, user_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_conversation(conv_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_conversation(conv_id: str) -> bool:
    conn = _get_conn()
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
    conn.commit()
    deleted = cur.rowcount > 0
    conn.close()
    return deleted


def update_conversation_title(conv_id: str, title: str) -> bool:
    conn = _get_conn()
    now = datetime.now().isoformat()
    cur = conn.execute(
        "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
        (title, now, conv_id),
    )
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def add_message(conv_id: str, role: str, content: str) -> dict:
    conn = _get_conn()
    now = datetime.now().isoformat()
    cur = conn.execute(
        "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)",
        (conv_id, role, content, now),
    )
    conn.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conv_id))
    conn.commit()
    msg_id = cur.lastrowid
    conn.close()
    return {"id": msg_id, "conversation_id": conv_id, "role": role, "content": content, "created_at": now}


def get_messages(conv_id: str) -> list:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC", (conv_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_hermes_messages(conv_id: str) -> list | None:
    conn = _get_conn()
    row = conn.execute("SELECT hermes_messages FROM conversations WHERE id = ?", (conv_id,)).fetchone()
    conn.close()
    if not row or not row["hermes_messages"]:
        return None
    try:
        return json.loads(row["hermes_messages"])
    except (json.JSONDecodeError, TypeError):
        return None


def save_hermes_messages(conv_id: str, messages: list) -> bool:
    conn = _get_conn()
    now = datetime.now().isoformat()
    cur = conn.execute(
        "UPDATE conversations SET hermes_messages = ?, updated_at = ? WHERE id = ?",
        (json.dumps(messages, ensure_ascii=False), now, conv_id),
    )
    conn.commit()
    conn.close()
    return cur.rowcount > 0


# 初始化
init_chat_db()
