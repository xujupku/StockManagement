# 阿里云服务器部署指南

## 一、服务器环境准备

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Python 3.11+
sudo apt install python3 python3-pip python3-venv -y

# 安装 Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs -y

# 安装 Nginx
sudo apt install nginx -y
```

## 二、上传代码

在本地执行：

```bash
# 打包代码（排除 node_modules 和数据库文件）
rsync -avz --exclude 'node_modules' --exclude '*.db' --exclude '.env' \
  /Users/bytedance/Project/StockProject/ \
  root@39.96.197.206:/opt/StockProject/
```

## 三、后端部署

```bash
# SSH 到服务器
ssh root@39.96.197.206

cd /opt/StockProject/server

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 复制环境变量模板
cp .env.example .env
# 编辑 .env 填入 DEEPSEEK_API_KEY、EXA_API_KEY 等

# 启动后端服务
nohup python3 main.py > py.log 2>&1 &
ps aux | grep "python3 main.py"

# 使用 systemd 托管后端服务
sudo cp /opt/StockProject/deploy/stock-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable stock-backend
sudo systemctl start stock-backend
```

## 四、前端构建

```bash
cd /opt/StockProject

# 安装依赖
npm install

# 构建
npm run build
# 输出在 dist/ 目录
```

## 五、配置 Nginx

```bash
# 复制 Nginx 配置
sudo cp /opt/StockProject/deploy/nginx.conf /etc/nginx/sites-available/stock

# 启用站点
sudo ln -sf /etc/nginx/sites-available/stock /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

## 六、验证

浏览器访问 `http://39.96.197.206`，应能看到应用首页。

***

## 常用命令

```bash
# 查看后端日志
sudo journalctl -u stock-backend -f

# 重启后端
sudo systemctl restart stock-backend

# 重新构建前端
cd /opt/StockProject && npm run build

# 重载 Nginx
sudo systemctl reload nginx
```

## 更新部署

本地执行：

```bash
# 上传最新代码
rsync -avz --exclude 'node_modules' --exclude '*.db' --exclude '.env' \
  /Users/bytedance/Project/StockProject/ \
  root@39.96.197.206:/opt/StockProject/

# SSH 到服务器
ssh root@39.96.197.206

cd /opt/StockProject
npm run build
sudo systemctl restart stock-backend

# 启动后端服务
source ~/hermes_env/bin/activate
nohup python3 main.py > py.log 2>&1 &
```

