import os
import re
from datetime import datetime
from contextlib import asynccontextmanager

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
)
from auth_db import (
    register_user, verify_user, get_user_by_id,
    create_token, verify_token as verify_jwt_token,
)
from activity_log_db import insert_logs, query_logs, get_log_stats

from fastapi.responses import StreamingResponse
import sys
sys.path.append(os.path.expanduser('~/.hermes/hermes-agent/'))
from run_agent import AIAgent  # 引入 Hermes Agent 核心类

load_dotenv()


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
            total = await _compute_total_assets_cny()
            today = datetime.now(bj_tz).strftime('%Y-%m-%d')
            add_asset_snapshot(today, total)
            print(f"[Snapshot] {today} total_cny={total:.2f}")
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


# ===== 用户认证 API =====

from typing import List, Dict, Any, Optional

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

class ChatMessage(BaseModel):
    role: str
    content: str

class QueryRequest(BaseModel):
    query: str
    messages: Optional[List[ChatMessage]] = None
    base_url: str = "https://api.deepseek.com"
    model: str = "deepseek-v4-flash"
    api_key: Optional[str] = None  # 用户自定义 API Key，留空则使用系统默认
    exa_key: Optional[str] = None  # 用户自定义 Exa API Key，用于 web_search

def _build_history(messages: Optional[List[ChatMessage]]) -> Optional[List[Dict[str, Any]]]:
    if not messages:
        return None
    return [{"role": m.role, "content": m.content} for m in messages]


@app.post("/api/v1/run")
async def run_hermes(request: QueryRequest):
    try:
        history = _build_history(request.messages)

        def _run_agent():
            if request.exa_key:
                os.environ["EXA_API_KEY"] = request.exa_key
            agent_kwargs = dict(
                base_url=request.base_url,
                model=request.model,
                quiet_mode=True
            )
            if request.api_key:
                agent_kwargs['api_key'] = request.api_key
            ai = AIAgent(**agent_kwargs)
            return ai.run_conversation(
                request.query,
                conversation_history=history
            )

        result = await asyncio.to_thread(_run_agent)

        if isinstance(result, dict):
            response_text = result.get('final_response', '') or ''
        else:
            response_text = str(result) if result else ''

        return {
            "status": "success",
            "response": response_text
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hermes 执行失败: {str(e)}")


@app.post("/api/v1/run_stream")
async def run_hermes_stream(request: QueryRequest):
    import queue as _queue
    import json as _json

    async def generate():
        q: _queue.Queue = _queue.Queue()
        history = _build_history(request.messages)

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
            agent_kwargs = dict(
                base_url=request.base_url,
                model=request.model,
                quiet_mode=True,
                tool_start_callback=_tool_start_cb,
                tool_complete_callback=_tool_complete_cb,
            )
            if request.api_key:
                agent_kwargs['api_key'] = request.api_key
            ai = AIAgent(**agent_kwargs)
            try:
                result = ai.run_conversation(
                    request.query,
                    conversation_history=history,
                    stream_callback=_stream_callback
                )
                if isinstance(result, dict):
                    final = result.get('final_response', '') or ''
                else:
                    final = str(result) if result else ''
                q.put(("done", final))
                return result
            except Exception as exc:
                q.put(("error", str(exc)))
                return None

        loop = asyncio.get_event_loop()
        future = loop.run_in_executor(None, _run_agent)

        while True:
            try:
                item = await asyncio.to_thread(q.get, timeout=600)
            except Exception:
                break

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
    """获取会话的所有消息"""
    return get_messages(conv_id)


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
