import os
import re
import threading
from datetime import datetime
from contextlib import asynccontextmanager
from typing import List, Dict, Any, Optional

import asyncio
from fastapi import FastAPI, HTTPException, Depends, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import httpx

from pydantic import BaseModel

from models import AnalyzeRequest, AnalyzeResponse
from analysis_engine import HermesAgent
from holdings_db import (
    init_db, get_all_holdings, add_holding, update_holding, delete_holding,
    HoldingItem, HoldingUpdate,
    get_cash, update_cash,
    add_asset_snapshot, get_asset_snapshots,
    get_watchlist, add_watch, remove_watch, WatchItem,
)
from chat_db import (
    create_conversation, list_conversations, get_conversation,
    delete_conversation, update_conversation_title,
    add_message, get_messages,
    get_hermes_messages, save_hermes_messages,
)
from auth_db import (
    register_user, verify_user, get_user_by_id, list_user_ids,
    create_token, verify_token as verify_jwt_token,
)
from activity_log_db import insert_logs, query_logs, get_log_stats

from fastapi.responses import StreamingResponse
import sys
sys.path.append(os.path.expanduser('~/.hermes/hermes-agent/'))
from run_agent import AIAgent

load_dotenv()

# ─── 线程级 HERMES_HOME 隔离 ───
# AIAgent 内部通过 os.environ["HERMES_HOME"] 获取路径，这是进程全局变量。
# 为支持多用户并发，使用 threading.local 为每个线程维护独立的 HERMES_HOME。
_thread_local = threading.local()
_OriginalEnvironClass = os.environ.__class__
_original_environ_getitem = _OriginalEnvironClass.__getitem__
_original_environ_get = _OriginalEnvironClass.get

def _patched_environ_getitem(self, key):
    if key == "HERMES_HOME":
        val = getattr(_thread_local, "hermes_home", None)
        if val is not None:
            return val
    return _original_environ_getitem(self, key)

def _patched_environ_get(self, key, default=None):
    if key == "HERMES_HOME":
        val = getattr(_thread_local, "hermes_home", None)
        if val is not None:
            return val
    return _original_environ_get(self, key, default)

_OriginalEnvironClass.__getitem__ = _patched_environ_getitem
_OriginalEnvironClass.get = _patched_environ_get

# os.getenv 底层也读 os.environ，但部分实现直接绑定了原始方法，需要额外 patch
_original_getenv = os.getenv

def _patched_getenv(key, default=None):
    if key == "HERMES_HOME":
        val = getattr(_thread_local, "hermes_home", None)
        if val is not None:
            return val
    return _original_getenv(key, default)

os.getenv = _patched_getenv

DEFAULT_CHAT_HISTORY_TURN_LIMIT = 10


SINA_API = "https://hq.sinajs.cn"


# ===== 用户认证中间件 =====

def get_current_user(request: Request) -> dict:
    """从请求头中解析 JWT，返回用户信息。未认证时返回 default 用户。"""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        # 未登录用户使用 default 身份（向后兼容）
        return {"user_id": "default", "email": ""}

    token = auth_header[7:]
    payload = verify_jwt_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token 无效或已过期")
    return {"user_id": payload["user_id"], "email": payload.get("email", "")}


def get_user_id(request: Request) -> str:
    """简化版：只获取 user_id"""
    user = get_current_user(request)
    return user["user_id"]


# ===== 定时快照任务 =====

async def _compute_total_assets_cny(user_id: str = "default") -> float:
    """计算当前总资产（人民币）= 现金折算 + 持仓市值折算"""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{SINA_API}/list=fx_susdcny,fx_shkdcny",
                headers={
                    'Referer': 'https://finance.sina.com.cn',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                },
            )
            text = resp.content.decode('gbk', errors='ignore')
        rates: dict[str, float] = {'CNY': 1.0}
        m = re.search(r'hq_str_fx_susdcny="([^"]+)"', text)
        if m:
            rates['USD'] = float(m.group(1).split(',')[0])
        m = re.search(r'hq_str_fx_shkdcny="([^"]+)"', text)
        if m:
            rates['HKD'] = float(m.group(1).split(',')[0])
    except Exception:
        rates = {'CNY': 1.0, 'USD': 6.8628, 'HKD': 0.87581}

    cash = get_cash(user_id)
    cash_cny = (cash.get('CNY', 0) * rates.get('CNY', 1)
                + cash.get('USD', 0) * rates.get('USD', 6.8628)
                + cash.get('HKD', 0) * rates.get('HKD', 0.87581))

    holdings = get_all_holdings(user_id)
    codes = [h['code'] for h in holdings]
    prices: dict[str, float] = {}
    if codes:
        sina_map = {code: _code_to_sina(code) for code in codes}
        sina_list = ','.join(sina_map.values())
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{SINA_API}/list={sina_list}",
                    headers={
                        'Referer': 'https://finance.sina.com.cn',
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                    },
                )
                text = resp.content.decode('gbk', errors='ignore')
            for code, sina_code in sina_map.items():
                price = _parse_sina_price(sina_code, text)
                if price is not None:
                    prices[code] = price
        except Exception:
            pass

    def _get_currency(code: str) -> str:
        if code.endswith('.HK'):
            return 'HKD'
        if code.isdigit() and len(code) <= 5:
            return 'HKD'
        if code[0].isdigit():
            return 'CNY'
        return 'USD'

    holdings_cny = 0.0
    for h in holdings:
        price = prices.get(h['code'], h['current_price'])
        currency = _get_currency(h['code'])
        holdings_cny += price * h['quantity'] * rates.get(currency, 1)

    return cash_cny + holdings_cny


async def _snapshot_scheduler():
    """每天北京时间 10:00 记录一次总资产快照"""
    import pytz
    bj_tz = pytz.timezone('Asia/Shanghai')
    while True:
        now = datetime.now(bj_tz)
        target = now.replace(hour=10, minute=0, second=0, microsecond=0)
        if now >= target:
            from datetime import timedelta
            target = target + timedelta(days=1)
        wait_seconds = (target - now).total_seconds()
        await asyncio.sleep(wait_seconds)

        try:
            today = datetime.now(bj_tz).strftime('%Y-%m-%d')
            for user_id in list_user_ids():
                try:
                    total = await _compute_total_assets_cny(user_id)
                    add_asset_snapshot(today, total, user_id)
                    print(f"[Snapshot] {today} user={user_id} total_cny={total:.2f}")
                except Exception as user_exc:
                    print(f"[Snapshot] 用户 {user_id} 记录失败: {user_exc}")
        except Exception as e:
            print(f"[Snapshot] 记录失败: {e}")


@asynccontextmanager
async def lifespan(app_instance):
    """应用生命周期：启动定时快照"""
    task = asyncio.create_task(_snapshot_scheduler())
    yield
    task.cancel()


app = FastAPI(title="AI股票投资管家 - 分析服务", version="1.0.0", lifespan=lifespan)

# CORS
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,https://tauri.localhost,tauri://localhost").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化数据库
init_db()

# 初始化 Agent
agent = HermesAgent()


def run_agent_for_user(
    user_id: str,
    query: str,
    conversation_history=None,
    stream_callback=None,
    base_url: str = "https://api.deepseek.com",
    model: str = "deepseek-v4-flash",
    api_key: str = None,
    provider: str = "DeepSeek",
    tool_start_callback=None,
    tool_complete_callback=None,
    conv_id: str = None,
):
    user_session_id = f"session_{user_id}"
    user_hermes_home = os.path.abspath(
        os.path.expanduser(f"~/.hermes/sessions/{user_session_id}")
    )
    os.makedirs(user_hermes_home, exist_ok=True)

    # 每个 conversation 使用独立的 session_id，便于日志隔离和问题排查
    effective_session_id = conv_id if conv_id else user_id

    agent_kwargs = dict(
        provider=provider,
        base_url=base_url,
        model=model,
        session_id=effective_session_id,
        quiet_mode=True,
    )
    if api_key:
        agent_kwargs['api_key'] = api_key
    if tool_start_callback:
        agent_kwargs['tool_start_callback'] = tool_start_callback
    if tool_complete_callback:
        agent_kwargs['tool_complete_callback'] = tool_complete_callback

    # 通过 threading.local 设置当前线程的 HERMES_HOME，支持多用户并发
    _thread_local.hermes_home = user_hermes_home
    try:
        ai = AIAgent(**agent_kwargs)
        result = ai.run_conversation(
            query,
            conversation_history=conversation_history,
            stream_callback=stream_callback,
        )
    finally:
        _thread_local.hermes_home = None

    return result



def get_chat_history_turn_limit() -> int:
    raw_value = os.getenv("CHAT_HISTORY_TURN_LIMIT", str(DEFAULT_CHAT_HISTORY_TURN_LIMIT)).strip()
    try:
        limit = int(raw_value)
    except ValueError:
        return DEFAULT_CHAT_HISTORY_TURN_LIMIT
    return limit if limit >= -1 else DEFAULT_CHAT_HISTORY_TURN_LIMIT


def trim_conversation_history(messages: Optional[list], max_turns: int) -> Optional[list]:
    if not messages or max_turns == -1:
        return messages
    if max_turns == 0:
        return [
            msg for msg in messages
            if isinstance(msg, dict) and msg.get("role") in {"system", "developer"}
        ]

    # From the end, count the most recent N user messages and keep everything
    # after the earliest kept user message, including tool/assistant content.
    remaining_user_messages = max_turns
    start_index = None
    for index in range(len(messages) - 1, -1, -1):
        msg = messages[index]
        if not isinstance(msg, dict):
            continue
        if msg.get("role") != "user":
            continue
        remaining_user_messages -= 1
        start_index = index
        if remaining_user_messages == 0:
            break

    if start_index is None or remaining_user_messages > 0:
        return messages

    preserved_prefix = [
        msg for msg in messages[:start_index]
        if isinstance(msg, dict) and msg.get("role") in {"system", "developer"}
    ]
    return preserved_prefix + messages[start_index:]


# ===== 用户认证 API =====

class RegisterRequest(BaseModel):
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str


@app.post("/api/auth/register")
async def api_register(data: RegisterRequest):
    """用户注册"""
    if not data.email or '@' not in data.email:
        raise HTTPException(status_code=400, detail="请输入有效的邮箱地址")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="密码至少6位")
    try:
        user = register_user(data.email, data.password)
        token = create_token(user['id'], user['email'])
        return {"status": "success", "user": user, "token": token}
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.post("/api/auth/login")
async def api_login(data: LoginRequest):
    """用户登录"""
    user = verify_user(data.email, data.password)
    if not user:
        raise HTTPException(status_code=401, detail="邮箱或密码错误")
    token = create_token(user['id'], user['email'])
    return {"status": "success", "user": user, "token": token}


@app.get("/api/auth/me")
async def api_get_me(request: Request):
    """获取当前登录用户信息"""
    user_info = get_current_user(request)
    if user_info["user_id"] == "default":
        raise HTTPException(status_code=401, detail="未登录")
    user = get_user_by_id(user_info["user_id"])
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user


# ===== AI Agent API =====

class QueryRequest(BaseModel):
    query: str
    conv_id: Optional[str] = None
    base_url: str = "https://api.deepseek.com"
    model: str = "deepseek-v4-flash"
    provider: str = "DeepSeek"
    api_key: Optional[str] = None
    exa_key: Optional[str] = None


@app.post("/api/v1/run")
async def run_hermes(request: QueryRequest, req: Request):
    user_id = get_user_id(req)
    history = trim_conversation_history(
        get_hermes_messages(request.conv_id) if request.conv_id else None,
        get_chat_history_turn_limit(),
    )

    if request.exa_key:
        os.environ["EXA_API_KEY"] = request.exa_key

    def _run_agent():
        return run_agent_for_user(
            user_id=user_id,
            query=request.query,
            conversation_history=history,
            base_url=request.base_url,
            model=request.model,
            api_key=request.api_key,
            provider=request.provider,
            conv_id=request.conv_id,
        )

    try:
        result = await asyncio.to_thread(_run_agent)

        if isinstance(result, dict):
            response_text = result.get('final_response', '') or ''
            hermes_msgs = result.get('messages', [])
        else:
            response_text = str(result) if result else ''
            hermes_msgs = []

        if request.conv_id and hermes_msgs:
            save_hermes_messages(request.conv_id, hermes_msgs)

        return {
            "status": "success",
            "response": response_text,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hermes 执行失败: {str(e)}")


@app.post("/api/v1/run_stream")
async def run_hermes_stream(request: QueryRequest, req: Request):
    import queue as _queue
    import json as _json

    user_id = get_user_id(req)

    async def generate():
        q: _queue.Queue = _queue.Queue()
        history = trim_conversation_history(
            get_hermes_messages(request.conv_id) if request.conv_id else None,
            get_chat_history_turn_limit(),
        )

        def _stream_callback(delta: str):
            if delta:
                q.put(("delta", delta))

        def _tool_start_cb(tool_call_id: str, name: str, args: dict):
            q.put(("tool_start", {"name": name, "args": {k: str(v)[:100] for k, v in (args or {}).items() if k != "content"}}))

        def _tool_complete_cb(tool_call_id: str, name: str, args: dict, result: str):
            q.put(("tool_complete", {"name": name, "duration": None}))

        def _run_agent():
            if request.exa_key:
                os.environ["EXA_API_KEY"] = request.exa_key

            try:
                result = run_agent_for_user(
                    user_id=user_id,
                    query=request.query,
                    conversation_history=history,
                    stream_callback=_stream_callback,
                    base_url=request.base_url,
                    model=request.model,
                    api_key=request.api_key,
                    provider=request.provider,
                    tool_start_callback=_tool_start_cb,
                    tool_complete_callback=_tool_complete_cb,
                    conv_id=request.conv_id,
                )

                if isinstance(result, dict):
                    final = result.get('final_response', '') or ''
                    hermes_msgs = result.get('messages', [])
                else:
                    final = str(result) if result else ''
                    hermes_msgs = []

                if request.conv_id and hermes_msgs:
                    save_hermes_messages(request.conv_id, hermes_msgs)

                # 如果 final_response 为空，尝试从 messages 中提取最后一条 assistant 回复
                if not final and hermes_msgs:
                    for msg in reversed(hermes_msgs):
                        if isinstance(msg, dict) and msg.get('role') == 'assistant':
                            content = msg.get('content', '')
                            if isinstance(content, str) and content.strip():
                                final = content
                                break

                q.put(("done", final))
                return result
            except Exception as exc:
                q.put(("error", str(exc)))
                return None

        loop = asyncio.get_event_loop()
        future = loop.run_in_executor(None, _run_agent)

        # 心跳间隔（秒）：防止 Nginx/浏览器因长时间无数据而断开连接
        HEARTBEAT_INTERVAL = 15

        while True:
            try:
                item = await asyncio.to_thread(q.get, timeout=HEARTBEAT_INTERVAL)
            except Exception:
                # 队列超时：检查 agent 是否仍在运行
                if future.done():
                    break
                # 发送心跳保活
                yield ": heartbeat\n\n"
                continue

            msg_type, payload = item

            if msg_type == "done":
                yield f"data: {_json.dumps({'type': 'final', 'content': payload}, ensure_ascii=False)}\n\n"
                break
            elif msg_type == "error":
                yield f"data: {_json.dumps({'type': 'error', 'content': payload}, ensure_ascii=False)}\n\n"
                break
            elif msg_type in ("tool_start", "tool_complete"):
                yield f"data: {_json.dumps({'type': msg_type, 'content': payload}, ensure_ascii=False)}\n\n"
            else:
                yield f"data: {_json.dumps({'type': 'delta', 'content': payload}, ensure_ascii=False)}\n\n"

        yield "data: [DONE]\n\n"
        await future

    return StreamingResponse(generate(), media_type="text/event-stream")

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze_portfolio(req: AnalyzeRequest):
    """分析用户持仓"""
    try:
        result = await agent.analyze(req)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析失败: {str(e)}")


# ===== 持仓管理 API =====

@app.get("/api/holdings")
async def list_holdings(request: Request):
    """获取所有持仓"""
    user_id = get_user_id(request)
    return get_all_holdings(user_id)


@app.post("/api/holdings")
async def create_holding(item: HoldingItem, request: Request):
    """添加/更新持仓"""
    user_id = get_user_id(request)
    return add_holding(item, user_id)


@app.put("/api/holdings/{code}")
async def modify_holding(code: str, data: HoldingUpdate, request: Request):
    """更新持仓信息"""
    user_id = get_user_id(request)
    result = update_holding(code, data, user_id)
    if result is None:
        raise HTTPException(status_code=404, detail="持仓不存在")
    return result


@app.delete("/api/holdings/{code}")
async def remove_holding(code: str, request: Request):
    """删除持仓"""
    user_id = get_user_id(request)
    if not delete_holding(code, user_id):
        raise HTTPException(status_code=404, detail="持仓不存在")
    return {"ok": True}


# ===== 股票实时价格 API =====

def _code_to_sina(code: str) -> str:
    """将应用中的股票代码转为新浪格式"""
    code = code.strip()
    if code.endswith('.HK'):
        num = code.replace('.HK', '')
        return f"hk{num.zfill(5)}"
    elif code.isdigit() and len(code) <= 5:
        return f"hk{code.zfill(5)}"
    elif code[0].isdigit():
        return f"sh{code}" if code.startswith('6') else f"sz{code}"
    else:
        return f"gb_{code.lower()}"


def _parse_sina_price(sina_code: str, text: str) -> float | None:
    """从新浪响应中解析价格"""
    pattern = rf'var hq_str_{re.escape(sina_code)}="(.+?)";'
    match = re.search(pattern, text)
    if not match:
        return None
    fields = match.group(1).split(',')
    try:
        if sina_code.startswith('hk'):
            price = float(fields[6])
        elif sina_code.startswith('gb_'):
            price = float(fields[1])
        else:
            price = float(fields[3])
        return price if price > 0 else None
    except (IndexError, ValueError):
        return None


def _parse_sina_quote(sina_code: str, text: str) -> dict | None:
    """从新浪响应中解析价格 + 前收盘价"""
    pattern = rf'var hq_str_{re.escape(sina_code)}="(.+?)";'
    match = re.search(pattern, text)
    if not match:
        return None
    fields = match.group(1).split(',')
    try:
        if sina_code.startswith('hk'):
            price = float(fields[6])
            prev_close = float(fields[3])
        elif sina_code.startswith('gb_'):
            price = float(fields[1])
            try:
                change = float(fields[4])
                prev_close = price - change
            except (IndexError, ValueError):
                prev_close = 0
        else:
            price = float(fields[3])
            prev_close = float(fields[2])
        if price <= 0:
            return None
        return {"price": price, "prevClose": prev_close if prev_close > 0 else None}
    except (IndexError, ValueError):
        return None


@app.get("/api/prices")
async def get_prices(codes: str = Query(..., description="逗号分隔的股票代码")):
    """获取股票最新价格"""
    code_list = [c.strip() for c in codes.split(',') if c.strip()]
    if not code_list:
        return {}

    sina_map = {code: _code_to_sina(code) for code in code_list}
    sina_list = ','.join(sina_map.values())

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{SINA_API}/list={sina_list}",
                headers={
                    'Referer': 'https://finance.sina.com.cn',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                },
            )
            text = resp.content.decode('gbk', errors='ignore')
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"行情接口请求失败: {str(e)}")

    result = {}
    for code, sina_code in sina_map.items():
        price = _parse_sina_price(sina_code, text)
        if price is not None:
            result[code] = price

    return result


@app.get("/api/quotes")
async def get_quotes(codes: str = Query(..., description="逗号分隔的股票代码")):
    """获取股票最新价格 + 前收盘价"""
    code_list = [c.strip() for c in codes.split(',') if c.strip()]
    if not code_list:
        return {}

    sina_map = {code: _code_to_sina(code) for code in code_list}
    sina_list = ','.join(sina_map.values())

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{SINA_API}/list={sina_list}",
                headers={
                    'Referer': 'https://finance.sina.com.cn',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                },
            )
            text = resp.content.decode('gbk', errors='ignore')
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"行情接口请求失败: {str(e)}")

    result = {}
    for code, sina_code in sina_map.items():
        quote = _parse_sina_quote(sina_code, text)
        if quote is not None:
            result[code] = quote

    return result


# ===== 现金管理 API =====

from pydantic import BaseModel as PydanticBaseModel


class CashUpdate(PydanticBaseModel):
    currency: str
    amount: float


@app.get("/api/cash")
async def read_cash(request: Request):
    """返回 {CNY: ..., HKD: ..., USD: ...}"""
    user_id = get_user_id(request)
    return get_cash(user_id)


@app.put("/api/cash")
async def set_cash(data: CashUpdate, request: Request):
    """更新指定币种的现金余额"""
    user_id = get_user_id(request)
    try:
        return update_cash(data.currency, data.amount, user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ===== 汇率 API =====

@app.get("/api/rates")
async def get_rates():
    """获取 USD→CNY 和 HKD→CNY 汇率"""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{SINA_API}/list=fx_susdcny,fx_shkdcny",
                headers={
                    'Referer': 'https://finance.sina.com.cn',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                },
            )
            text = resp.content.decode('gbk', errors='ignore')

        rates = {}
        m = re.search(r'hq_str_fx_susdcny="([^"]+)"', text)
        if m:
            rates['USD'] = float(m.group(1).split(',')[0])
        m = re.search(r'hq_str_fx_shkdcny="([^"]+)"', text)
        if m:
            rates['HKD'] = float(m.group(1).split(',')[0])
        rates['CNY'] = 1.0
        return rates
    except Exception:
        return {"USD": 6.8628, "HKD": 0.87581, "CNY": 1.0}


# ===== 资产快照 API =====

@app.get("/api/asset-snapshots")
async def list_asset_snapshots(request: Request, limit: int = Query(90, ge=1, le=365)):
    """获取最近 N 天的资产快照"""
    user_id = get_user_id(request)
    return get_asset_snapshots(limit, user_id)


@app.post("/api/asset-snapshots")
async def trigger_snapshot(request: Request):
    """手动触发一次当日快照记录"""
    import pytz
    user_id = get_user_id(request)
    bj_tz = pytz.timezone('Asia/Shanghai')
    total = await _compute_total_assets_cny(user_id)
    today = datetime.now(bj_tz).strftime('%Y-%m-%d')
    add_asset_snapshot(today, total, user_id)
    return {"date": today, "value": total}


# ===== 关注列表 API =====

@app.get("/api/watchlist")
async def list_watchlist(request: Request):
    """获取关注列表"""
    user_id = get_user_id(request)
    return get_watchlist(user_id)


@app.post("/api/watchlist")
async def create_watch(item: WatchItem, request: Request):
    """添加关注股票"""
    user_id = get_user_id(request)
    return add_watch(item, user_id)


@app.delete("/api/watchlist/{code:path}")
async def delete_watch(code: str, request: Request):
    """删除关注股票"""
    user_id = get_user_id(request)
    if not remove_watch(code, user_id):
        raise HTTPException(status_code=404, detail="未找到该关注股票")
    return {"ok": True}


# ===== 聊天记录 API =====

class ConversationCreate(BaseModel):
    title: str = "新对话"
    type: str = "chat"

class MessageCreate(BaseModel):
    role: str
    content: str

class TitleUpdate(BaseModel):
    title: str


@app.get("/api/conversations")
async def api_list_conversations(request: Request, type: str = None):
    """获取会话列表"""
    user_id = get_user_id(request)
    return list_conversations(conv_type=type, user_id=user_id)


@app.post("/api/conversations")
async def api_create_conversation(data: ConversationCreate, request: Request):
    """创建新会话"""
    user_id = get_user_id(request)
    conv_type = data.type or 'chat'
    return create_conversation(data.title, conv_type=conv_type, user_id=user_id)


@app.get("/api/conversations/{conv_id}")
async def api_get_conversation(conv_id: str):
    """获取会话详情"""
    conv = get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")
    return conv


@app.put("/api/conversations/{conv_id}")
async def api_update_conversation(conv_id: str, data: TitleUpdate):
    """更新会话标题"""
    if not update_conversation_title(conv_id, data.title):
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"ok": True}


@app.delete("/api/conversations/{conv_id}")
async def api_delete_conversation(conv_id: str):
    """删除会话"""
    if not delete_conversation(conv_id):
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"ok": True}


@app.get("/api/conversations/{conv_id}/messages")
async def api_get_messages(conv_id: str):
    """获取会话的所有消息，自动补录因连接中断丢失的 assistant 回复"""
    msgs = get_messages(conv_id)

    # 检查是否存在 user 消息后没有对应 assistant 回复的情况
    if msgs and msgs[-1].get('role') == 'user':
        # 最后一条是 user 消息，说明 assistant 回复可能丢失
        hermes = get_hermes_messages(conv_id)
        if hermes:
            # 从 hermes_messages 中提取最后一条有内容的 assistant 回复
            last_assistant = ''
            for m in reversed(hermes):
                if isinstance(m, dict) and m.get('role') == 'assistant':
                    content = m.get('content', '')
                    if isinstance(content, str) and content.strip():
                        last_assistant = content
                        break
            if last_assistant:
                # 补录到 messages 表
                added = add_message(conv_id, 'assistant', last_assistant)
                msgs.append(added)

    return msgs


@app.post("/api/conversations/{conv_id}/messages")
async def api_add_message(conv_id: str, data: MessageCreate):
    """添加消息到会话"""
    return add_message(conv_id, data.role, data.content)


# ===== 用户操作日志 API =====

class LogBatch(BaseModel):
    logs: list

@app.post("/api/activity-logs")
async def api_post_logs(data: LogBatch, request: Request):
    """批量上报用户操作日志"""
    user_id = get_user_id(request)
    insert_logs(data.logs, user_id)
    return {"ok": True, "count": len(data.logs)}

@app.get("/api/activity-logs")
async def api_get_logs(
    request: Request,
    event_type: str = None,
    page: str = None,
    limit: int = 100,
    offset: int = 0
):
    """查询操作日志"""
    user_id = get_user_id(request)
    logs = query_logs(user_id=user_id, event_type=event_type, page=page, limit=limit, offset=offset)
    return logs

@app.get("/api/activity-logs/stats")
async def api_log_stats(request: Request):
    """获取日志统计"""
    user_id = get_user_id(request)
    return get_log_stats(user_id=user_id)
