"""用户认证模块 - 注册/登录/JWT"""
import sqlite3
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional
import os
from db_paths import get_db_path

DB_PATH = get_db_path("users.db")

# JWT 简易实现（避免额外依赖）
import json
import base64
import hmac

JWT_SECRET = os.getenv("JWT_SECRET", "stock_app_secret_key_2026")
JWT_EXPIRE_HOURS = 72  # token 有效期


def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_user_db():
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            nickname TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            last_login TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    """)
    conn.commit()
    conn.close()


def _hash_password(password: str, salt: str) -> str:
    """使用 SHA-256 + salt 哈希密码"""
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def register_user(email: str, password: str) -> dict:
    """注册新用户，返回用户信息（不含密码）"""
    email = _normalize_email(email)
    conn = _get_conn()

    # 检查邮箱是否已注册
    existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        conn.close()
        raise ValueError("该邮箱已注册")

    user_id = uuid.uuid4().hex[:16]
    salt = secrets.token_hex(16)
    password_hash = _hash_password(password, salt)
    now = datetime.now().isoformat()

    try:
        conn.execute(
            "INSERT INTO users (id, email, password_hash, salt, nickname, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, email, password_hash, salt, email.split('@')[0], now),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise ValueError("该邮箱已注册")
    conn.close()

    return {"id": user_id, "email": email, "nickname": email.split('@')[0], "created_at": now}


def verify_user(email: str, password: str) -> Optional[dict]:
    """验证用户密码，成功返回用户信息，失败返回 None"""
    email = _normalize_email(email)
    conn = _get_conn()
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row:
        conn.close()
        return None

    user = dict(row)
    password_hash = _hash_password(password, user['salt'])

    if password_hash != user['password_hash']:
        conn.close()
        return None

    # 更新最后登录时间
    now = datetime.now().isoformat()
    conn.execute("UPDATE users SET last_login = ? WHERE id = ?", (now, user['id']))
    conn.commit()
    conn.close()

    return {"id": user['id'], "email": user['email'], "nickname": user['nickname'], "created_at": user['created_at']}


def get_user_by_id(user_id: str) -> Optional[dict]:
    """通过 ID 获取用户信息"""
    conn = _get_conn()
    row = conn.execute("SELECT id, email, nickname, created_at FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def list_user_ids(include_default: bool = True) -> list[str]:
    """返回当前系统中的用户 ID 列表。"""
    conn = _get_conn()
    rows = conn.execute("SELECT id FROM users ORDER BY created_at ASC").fetchall()
    conn.close()
    user_ids = [row["id"] for row in rows]
    if include_default and "default" not in user_ids:
        user_ids.insert(0, "default")
    return user_ids


# ===== 简易 JWT =====

def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')


def _b64decode(s: str) -> bytes:
    padding = 4 - len(s) % 4
    if padding != 4:
        s += '=' * padding
    return base64.urlsafe_b64decode(s)


def create_token(user_id: str, email: str) -> str:
    """生成 JWT token"""
    header = _b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload_data = {
        "user_id": user_id,
        "email": email,
        "exp": (datetime.now() + timedelta(hours=JWT_EXPIRE_HOURS)).timestamp(),
        "iat": datetime.now().timestamp(),
    }
    payload = _b64encode(json.dumps(payload_data).encode())
    signature = hmac.HMAC(JWT_SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256).hexdigest()
    return f"{header}.{payload}.{signature}"


def verify_token(token: str) -> Optional[dict]:
    """验证 JWT token，返回 payload 或 None"""
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None

        header, payload, signature = parts

        # 验证签名
        expected_sig = hmac.HMAC(JWT_SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            return None

        # 解析 payload
        payload_data = json.loads(_b64decode(payload))

        # 检查过期
        if payload_data.get('exp', 0) < datetime.now().timestamp():
            return None

        return payload_data
    except Exception:
        return None


# 初始化
init_user_db()
