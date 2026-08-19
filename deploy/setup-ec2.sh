#!/usr/bin/env bash
# One-time setup script to run ON the EC2 instance (Ubuntu 22.04/24.04 assumed).
# Usage: scp this repo to the instance (or git clone it there), then:
#   ssh -i your-key.pem ubuntu@<ec2-ip>
#   cd aurafit-backend && chmod +x deploy/setup-ec2.sh && sudo ./deploy/setup-ec2.sh
set -euo pipefail

APP_DIR="/opt/aurafit-backend"
SERVICE_NAME="aurafit-backend"

echo "==> Installing Node.js 20.x"
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

echo "==> Copying app to $APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo rsync -a --exclude node_modules --exclude .git ./ "$APP_DIR/"

echo "==> Installing dependencies and building"
cd "$APP_DIR"
sudo npm ci
sudo npm run build

if [ ! -f "$APP_DIR/.env" ]; then
  echo "==> No .env found at $APP_DIR/.env"
  echo "    Copy .env.example there and fill in GEMINI_API_KEY + FIREBASE_SERVICE_ACCOUNT_BASE64 before starting the service."
fi

echo "==> Installing systemd service"
sudo cp deploy/aurafit-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

echo "==> Done. Check status with: sudo systemctl status $SERVICE_NAME"
echo "==> Tail logs with: sudo tail -f /var/log/aurafit-backend.log"
echo ""
echo "Next: install nginx + certbot for HTTPS:"
echo "  sudo apt-get install -y nginx certbot python3-certbot-nginx"
echo "  sudo cp deploy/nginx.conf /etc/nginx/sites-available/aurafit-backend"
echo "  sudo ln -s /etc/nginx/sites-available/aurafit-backend /etc/nginx/sites-enabled/"
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo "  sudo certbot --nginx -d api.yourdomain.com"
