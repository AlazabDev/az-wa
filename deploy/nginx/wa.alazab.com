# AzWA — wa.alazab.com Nginx Configuration
# Note: SSL certificate paths are intentionally omitted here.
# Certbot automatically injects SSL configuration when running:
# sudo certbot --nginx -d wa.alazab.com

upstream azwa_backend {
    server 127.0.0.1:8085;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name wa.alazab.com;

    client_max_body_size 50M;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Static file handling & ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Proxy to PM2 Node.js server
    location / {
        proxy_pass http://azwa_backend;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
