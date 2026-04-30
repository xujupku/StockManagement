# 云端分析服务

## 环境要求
- Python 3.10+
- pip

## 安装
```bash
cd server
pip install -r requirements.txt
```

## 配置
复制 `.env.example` 为 `.env`，填入你的 API Key：
```bash
cp .env.example .env
```

## 启动
```bash
python main.py
```
服务默认运行在 `http://0.0.0.0:8000`

## 部署到云服务器
参见项目文档中的部署说明。
