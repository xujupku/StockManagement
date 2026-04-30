import os
import re
from datetime import datetime
from contextlib import asynccontextmanager

import asyncio
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
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

from fastapi.responses import StreamingResponse
import sys
sys.path.append('/usr/local/lib/hermes-agent')
from run_agent import AIAgent  # 引入 Hermes Agent 核心类

load_dotenv()


# ===== 定时快照任务 =====

SINA_API = "https://hq.sinajs.cn"


async def _compute_total_assets_cny() -> float:
    """计算当前总资产（人民币）= 现金折算 + 持仓市值折算"""
    # 获取汇率
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

    # 现金
    cash = get_cash()
    cash_cny = (cash.get('CNY', 0) * rates.get('CNY', 1)
                + cash.get('USD', 0) * rates.get('USD', 6.8628)
                + cash.get('HKD', 0) * rates.get('HKD', 0.87581))

    # 持仓市值
    holdings = get_all_holdings()
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
        # 计算下一个 10:00
        target = now.replace(hour=10, minute=0, second=0, microsecond=0)
        if now >= target:
            # 今天的10点已过，定到明天
            from datetime import timedelta
            target = target + timedelta(days=1)
        wait_seconds = (target - now).total_seconds()
        await asyncio.sleep(wait_seconds)

        # 到时间了，记录快照
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
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 鉴权
security = HTTPBearer()
API_SECRET = os.getenv("API_SECRET_KEY", "")


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials.credentials != API_SECRET:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return credentials


# 初始化数据库
init_db()

# 初始化 Agent
agent = HermesAgent()

class QueryRequest(BaseModel):
    query: str
    base_url: str = "https://api.deepseek.com"
    model: str = "deepseek-v4-pro"  # 你可以在这里指定使用的模型

@app.post("/api/v1/run")
async def run_hermes(request: QueryRequest):
    try:
        # Hermes 的底层调用是同步的，为了不阻塞 FastAPI，放在线程中执行
        def _run_agent():
            # 初始化 Agent：quiet_mode=True 会关闭花哨的终端动画，适合服务端运行
            agent = AIAgent(
                base_url=request.base_url,
                model=request.model,
                quiet_mode=True 
            )
            # 传入用户的 query 并获取执行完成后的最终文本/产物
            return agent.run_conversation(request.query)

        # 异步执行
        artifact = await asyncio.to_thread(_run_agent)
        
        return {
            "status": "success",
            "artifact": artifact
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hermes 执行失败: {str(e)}")

@app.post("/api/v1/run_stream")
async def run_hermes_stream(request: QueryRequest):

    async def generate():
        try:
            agent = AIAgent(base_url=request.base_url, model=request.model, quiet_mode=True)
            # AIAgent 仅提供同步 run_conversation，放到线程中执行
            result = await asyncio.to_thread(agent.run_conversation, request.query)

            # 将完整结果按块输出，模拟流式效果
            chunk_size = 4
            text = str(result) if result else ""
            for i in range(0, len(text), chunk_size):
                yield f"data: {text[i:i+chunk_size]}\n\n"
                await asyncio.sleep(0.02)

            yield "data: [DONE]\n\n"

        except Exception as e:
            yield f"data: [ERROR] {str(e)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze_portfolio(req: AnalyzeRequest, _=Depends(verify_token)):
    """分析用户持仓，返回多维度分析结果"""
    try:
        result = await agent.analyze(req)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析失败: {str(e)}")


# ===== 持仓管理 API =====

@app.get("/api/holdings")
async def list_holdings():
    """获取所有持仓"""
    return get_all_holdings()


@app.post("/api/holdings")
async def create_holding(item: HoldingItem):
    """添加/更新持仓"""
    return add_holding(item)


@app.put("/api/holdings/{code}")
async def modify_holding(code: str, data: HoldingUpdate):
    """更新持仓信息"""
    result = update_holding(code, data)
    if result is None:
        raise HTTPException(status_code=404, detail="持仓不存在")
    return result


@app.delete("/api/holdings/{code}")
async def remove_holding(code: str):
    """删除持仓"""
    if not delete_holding(code):
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
        # 港股: 5位及以下纯数字（如 01810, 00700）
        return f"hk{code.zfill(5)}"
    elif code[0].isdigit():
        # A股: 6位纯数字, 6开头上交所, 其余深交所
        return f"sh{code}" if code.startswith('6') else f"sz{code}"
    else:
        # 美股
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
            # 美股: 通过当前价和涨跌额反推前收
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
    """获取股票最新价格 + 前收盘价（用于计算涨跌幅）"""
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
async def read_cash():
    """返回 {CNY: ..., HKD: ..., USD: ...}"""
    return get_cash()


@app.put("/api/cash")
async def set_cash(data: CashUpdate):
    """更新指定币种的现金余额，返回全部余额"""
    try:
        return update_cash(data.currency, data.amount)
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
        # USD→CNY
        m = re.search(r'hq_str_fx_susdcny="([^"]+)"', text)
        if m:
            rates['USD'] = float(m.group(1).split(',')[0])
        # HKD→CNY
        m = re.search(r'hq_str_fx_shkdcny="([^"]+)"', text)
        if m:
            rates['HKD'] = float(m.group(1).split(',')[0])

        rates['CNY'] = 1.0
        return rates
    except Exception:
        # 回退到今日央行中间价
        return {"USD": 6.8628, "HKD": 0.87581, "CNY": 1.0}


# ===== 资产快照 API =====

@app.get("/api/asset-snapshots")
async def list_asset_snapshots(limit: int = Query(90, ge=1, le=365)):
    """获取最近 N 天的资产快照"""
    return get_asset_snapshots(limit)


@app.post("/api/asset-snapshots")
async def trigger_snapshot():
    """手动触发一次当日快照记录"""
    import pytz
    bj_tz = pytz.timezone('Asia/Shanghai')
    total = await _compute_total_assets_cny()
    today = datetime.now(bj_tz).strftime('%Y-%m-%d')
    add_asset_snapshot(today, total)
    return {"date": today, "value": total}


# ===== 关注列表 API =====

@app.get("/api/watchlist")
async def list_watchlist():
    """获取关注列表"""
    return get_watchlist()


@app.post("/api/watchlist")
async def create_watch(item: WatchItem):
    """添加关注股票"""
    return add_watch(item)


@app.delete("/api/watchlist/{code:path}")
async def delete_watch(code: str):
    """删除关注股票"""
    if not remove_watch(code):
        raise HTTPException(status_code=404, detail="未找到该关注股票")
    return {"ok": True}
