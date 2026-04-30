"""
Hermes Agent - 核心分析引擎
这是需要保护的核心逻辑，运行在云端服务器上，不暴露给客户端。
"""

import os
import json
import httpx
from models import AnalyzeRequest, AnalyzeResponse, ActionItem, DimensionAnalysis


SYSTEM_PROMPT = """你是一个专业的AI投资分析师，擅长多维度股票组合分析。
用户会提供他们的持仓数据和投资风格偏好，你需要进行以下维度的分析：

1. 风险评估：评估整体组合的风险等级
2. 行业集中度：分析行业分布是否合理
3. 波动性分析：评估组合的价格波动风险
4. 估值分析：判断当前持仓的估值水平
5. 动量分析：基于近期走势判断趋势方向

请严格按照以下JSON格式返回分析结果：
{
    "risk_level": "低风险|中低风险|中等风险|高风险|极高风险",
    "risk_score": 1到100的整数,
    "position_advice": "仓位建议文字",
    "actions": [
        {"type": "buy|sell|hold", "stock": "股票名", "code": "代码", "quantity": 数量, "reason": "理由"}
    ],
    "dimensions": [
        {"dimension": "维度名称", "score": 1到10, "summary": "一句话总结", "detail": "详细分析"}
    ],
    "overall_summary": "整体投资建议摘要"
}
"""


def build_user_prompt(req: AnalyzeRequest) -> str:
    style_map = {
        "conservative": "保守型（低风险，稳健收益）",
        "balanced": "平衡型（中等风险，兼顾收益与安全）",
        "aggressive": "激进型（高风险，追求高收益）",
        "longterm": "长期持有（价值投资，长线布局）",
        "shortterm": "短期交易（关注技术面，快进快出）",
    }

    holdings_text = "\n".join([
        f"- {h.name}({h.code}): 持有{h.quantity}股, 买入价¥{h.buy_price}, 现价¥{h.current_price}, "
        f"盈亏{'+' if h.current_price >= h.buy_price else ''}"
        f"¥{(h.current_price - h.buy_price) * h.quantity:.2f} "
        f"({(h.current_price - h.buy_price) / h.buy_price * 100:.2f}%)"
        for h in req.holdings
    ])

    total_value = sum(h.current_price * h.quantity for h in req.holdings)
    total_cost = sum(h.buy_price * h.quantity for h in req.holdings)

    return f"""## 投资者信息
- 投资风格：{style_map.get(req.style, req.style)}
- 持仓总市值：¥{total_value:,.2f}
- 总成本：¥{total_cost:,.2f}
- 总盈亏：¥{total_value - total_cost:,.2f} ({(total_value - total_cost) / total_cost * 100:.2f}%)

## 当前持仓
{holdings_text}

请基于以上信息，结合投资者的风格偏好，进行多维度分析并给出操作建议。"""


class HermesAgent:
    def __init__(self):
        self.api_key = os.getenv("HERMES_API_KEY", "")
        self.api_url = os.getenv("HERMES_API_URL", "")

    async def analyze(self, req: AnalyzeRequest) -> AnalyzeResponse:
        """调用 Hermes Agent 进行分析"""

        # 如果未配置 API，使用本地模拟分析
        if not self.api_key or not self.api_url:
            return self._fallback_analyze(req)

        # 调用 Hermes Agent API
        user_prompt = build_user_prompt(req)

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                self.api_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "hermes",
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": 0.3,
                    "response_format": {"type": "json_object"},
                },
            )
            response.raise_for_status()

        data = response.json()
        content = data["choices"][0]["message"]["content"]
        result = json.loads(content)

        return AnalyzeResponse(
            risk_level=result["risk_level"],
            risk_score=result["risk_score"],
            position_advice=result["position_advice"],
            actions=[ActionItem(**a) for a in result["actions"]],
            dimensions=[DimensionAnalysis(**d) for d in result["dimensions"]],
            overall_summary=result["overall_summary"],
        )

    def _fallback_analyze(self, req: AnalyzeRequest) -> AnalyzeResponse:
        """本地模拟分析（当 Hermes API 未配置时使用）"""
        total_value = sum(h.current_price * h.quantity for h in req.holdings)
        total_cost = sum(h.buy_price * h.quantity for h in req.holdings)
        profit_ratio = (total_value - total_cost) / total_cost if total_cost > 0 else 0
        profit_count = sum(1 for h in req.holdings if h.current_price > h.buy_price)
        loss_count = len(req.holdings) - profit_count

        # 风险评分
        risk_map = {
            "conservative": 25,
            "balanced": 50,
            "aggressive": 75,
            "longterm": 35,
            "shortterm": 85,
        }
        base_risk = risk_map.get(req.style, 50)
        concentration = max(h.current_price * h.quantity for h in req.holdings) / total_value if total_value > 0 else 0
        risk_score = min(100, int(base_risk + concentration * 20))

        risk_levels = ["低风险", "中低风险", "中等风险", "高风险", "极高风险"]
        risk_level = risk_levels[min(4, risk_score // 20)]

        # 生成维度分析
        dimensions = [
            DimensionAnalysis(
                dimension="风险评估",
                score=max(1, 10 - risk_score // 10),
                summary=f"组合整体{risk_level}",
                detail=f"基于您的{req.style}策略，当前组合风险评分为{risk_score}/100。"
                f"盈利股票{profit_count}只，亏损股票{loss_count}只，整体胜率"
                f"{profit_count / len(req.holdings) * 100:.0f}%。",
            ),
            DimensionAnalysis(
                dimension="行业集中度",
                score=max(1, min(10, int(10 - concentration * 10))),
                summary="集中度偏高" if concentration > 0.3 else "分散较合理",
                detail=f"最大单只持仓占比{concentration * 100:.1f}%，"
                f"{'建议分散投资降低单一标的风险' if concentration > 0.3 else '行业分布相对均衡'}。",
            ),
            DimensionAnalysis(
                dimension="波动性分析",
                score=6,
                summary="中等波动" if abs(profit_ratio) < 0.1 else "波动较大",
                detail=f"组合整体盈亏比例为{profit_ratio * 100:.2f}%，"
                f"波动处于{'可控范围' if abs(profit_ratio) < 0.1 else '需关注区间'}。",
            ),
            DimensionAnalysis(
                dimension="估值分析",
                score=7,
                summary="估值中性",
                detail="当前持仓以科技成长股为主，估值处于历史中位数附近，"
                "短期不存在显著高估或低估。",
            ),
            DimensionAnalysis(
                dimension="动量分析",
                score=7 if profit_ratio > 0 else 4,
                summary="趋势偏多" if profit_ratio > 0 else "趋势偏弱",
                detail=f"整体持仓{'处于盈利状态，动量方向偏多' if profit_ratio > 0 else '处于亏损状态，动量偏弱'}，"
                f"需关注支撑位变化。",
            ),
        ]

        # 生成操作建议
        actions = []
        sorted_holdings = sorted(req.holdings, key=lambda h: (h.current_price - h.buy_price) / h.buy_price)

        # 亏损最多的建议止损
        if sorted_holdings and (sorted_holdings[0].current_price - sorted_holdings[0].buy_price) / sorted_holdings[0].buy_price < -0.05:
            worst = sorted_holdings[0]
            actions.append(ActionItem(
                type="sell", stock=worst.name, code=worst.code,
                quantity=worst.quantity // 2,
                reason=f"亏损{(worst.current_price - worst.buy_price) / worst.buy_price * 100:.1f}%，建议减仓控制风险",
            ))

        # 盈利最多的建议止盈一部分
        if sorted_holdings and (sorted_holdings[-1].current_price - sorted_holdings[-1].buy_price) / sorted_holdings[-1].buy_price > 0.1:
            best = sorted_holdings[-1]
            actions.append(ActionItem(
                type="sell", stock=best.name, code=best.code,
                quantity=best.quantity // 3,
                reason=f"盈利{(best.current_price - best.buy_price) / best.buy_price * 100:.1f}%，建议部分止盈锁定收益",
            ))

        # 补一个买入建议
        actions.append(ActionItem(
            type="buy", stock="沪深300ETF", code="510300", quantity=100,
            reason="增加指数基金配置，分散个股风险，提高组合稳定性",
        ))

        return AnalyzeResponse(
            risk_level=risk_level,
            risk_score=risk_score,
            position_advice=f"当前组合{risk_level}，{'建议保持现有仓位' if risk_score < 50 else '建议适当降低仓位'}。"
            f"盈利股票占比{profit_count / len(req.holdings) * 100:.0f}%，"
            f"{'整体表现良好' if profit_ratio > 0 else '需关注风险控制'}。",
            actions=actions,
            dimensions=dimensions,
            overall_summary=f"基于{req.style}策略分析，您的投资组合当前{risk_level}（评分{risk_score}/100）。"
            f"建议关注仓位集中度和止损纪律，{'持续持有优质标的' if req.style in ('longterm', 'conservative') else '灵活调整仓位'}。",
        )
