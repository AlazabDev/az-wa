# AzWA — wa.alazab.com
# Canonical reverse proxy for the TanStack/Nitro Node runtime on 127.0.0.1:8085.

server {
  listen 80;
  listen [::]:80;
  server_name wa.alazab.com;
  server_tokens off;

  access_log /var/log/nginx/wa.alazab.com.access.log;
  error_log  /var/log/nginx/wa.alazab.com.error.log warn;

  location /.well-known/acme-challenge/ {
    root /var/www/html;
  }

  location / {
    return 301 https://$host$request_uri;
  }
}

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name wa.alazab.com;
  server_tokens off;

  access_log /var/log/nginx/wa.alazab.com.access.log;
  error_log  /var/log/nginx/wa.alazab.com.error.log warn;

  ssl_certificate     /etc/letsencrypt/live/wa.alazab.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/wa.alazab.com/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;

  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Robots-Tag "noindex, nofollow, noarchive" always;

  client_max_body_size 25m;

  # Never expose local configuration, VCS metadata, archived source or legacy UI.
  location ~ /(?:\.git|\.env|_isolated_legacy)(?:/|$) { return 404; }
  location ^~ /legacy { return 404; }

  # Stable public Meta callback mapped to the internal TanStack route.
  location = /webhooks/meta/whatsapp {
    client_max_body_size 2m;
    proxy_pass http://127.0.0.1:8085/api/public/webhooks/meta/whatsapp;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 10s;
    proxy_send_timeout 90s;
    proxy_read_timeout 90s;
  }

  location / {
    proxy_pass http://127.0.0.1:8085;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_connect_timeout 10s;
    proxy_send_timeout 90s;
    proxy_read_timeout 90s;
  }
}
