from pydantic import BaseModel
from typing import Literal


class StockHolding(BaseModel):
    name: str
    code: str
    quantity: int
    buy_price: float
    current_price: float


class AnalyzeRequest(BaseModel):
    holdings: list[StockHolding]
    style: Literal["conservative", "balanced", "aggressive", "longterm", "shortterm"]


class ActionItem(BaseModel):
    type: Literal["buy", "sell", "hold"]
    stock: str
    code: str
    quantity: int
    reason: str


class DimensionAnalysis(BaseModel):
    dimension: str
    score: int  # 1-10
    summary: str
    detail: str


class AnalyzeResponse(BaseModel):
    risk_level: str
    risk_score: int  # 1-100
    position_advice: str
    actions: list[ActionItem]
    dimensions: list[DimensionAnalysis]
    overall_summary: str
