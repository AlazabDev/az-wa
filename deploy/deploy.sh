#!/usr/bin/env bash
set -euo pipefail

# Deployment Script for AzWA (wa.alazab.com)
# Uses PM2, Nginx, and Certbot

DOMAIN="wa.alazab.com"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NGINX_CONF_SRC="${APP_DIR}/deploy/nginx/wa.alazab.com"
NGINX_CONF_DEST="/etc/nginx/sites-available/wa.alazab.com"
NGINX_CONF_LINK="/etc/nginx/sites-enabled/wa.alazab.com"

echo "=== [1/5] Building AzWA Application ==="
cd "${APP_DIR}"
if command -v bun &> /dev/null; then
    bun install
    bun run build
else
    npm install
    npm run build
fi

echo "=== [2/5] Configuring Nginx Site ==="
if [ -f "${NGINX_CONF_SRC}" ]; then
    sudo cp "${NGINX_CONF_SRC}" "${NGINX_CONF_DEST}"
    sudo ln -sf "${NGINX_CONF_DEST}" "${NGINX_CONF_LINK}"
    sudo nginx -t
    sudo systemctl reload nginx
fi

echo "=== [3/5] Requesting/Updating Certbot SSL Certificate ==="
# Certbot automatically modifies Nginx config to inject SSL certificates
sudo certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --redirect --register-unsafely-without-email || {
    echo "Warning: Certbot SSL setup failed or domain not pointing to host yet. Continuing..."
}

echo "=== [4/5] Starting / Reloading PM2 Process ==="
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2 globally..."
    sudo npm install -g pm2
fi

pm2 startOrReload "${APP_DIR}/deploy/ecosystem.config.cjs"
pm2 save

echo "=== [5/5] Deployment Complete! ==="
echo "Application running at https://${DOMAIN}"
