npm run build
rsync -avz dist root@39.96.197.206:/opt/StockProject/
rsync -avz src root@39.96.197.206:/opt/StockProject/
rsync -avz --exclude '*.db' --exclude '__pycache__' server root@39.96.197.206:/opt/StockProject/