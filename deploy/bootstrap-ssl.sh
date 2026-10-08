#!/usr/bin/env bash
set -Eeuo pipefail
DOMAIN="wa.alazab.com"
command -v certbot >/dev/null 2>&1 || { echo "certbot is required" >&2; exit 69; }
[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo "Run with sudo/root." >&2; exit 77; }
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect --register-unsafely-without-email
nginx -t
systemctl reload nginx
