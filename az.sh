#!/usr/bin/env bash
# ==============================================================================
# AzWA — Central Management & Deployment CLI (az.sh)
# Master Control Script: Manage, Build, Deploy, and Monitor AzWA (A to Z)
# ==============================================================================

set -euo pipefail

# --- Color Constants ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# --- Configuration & Paths ---
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN="wa.alazab.com"
PM2_CONFIG="${APP_DIR}/deploy/ecosystem.config.cjs"
NGINX_SRC="${APP_DIR}/deploy/nginx/wa.alazab.com"
NGINX_DEST="/etc/nginx/sites-available/wa.alazab.com"
NGINX_LINK="/etc/nginx/sites-enabled/wa.alazab.com"

# --- Helper Functions ---
log_info()    { echo -e "${CYAN}ℹ [AzWA]${NC} $1"; }
log_success() { echo -e "${GREEN}✔ [AzWA]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}⚠ [AzWA]${NC} $1"; }
log_error()   { echo -e "${RED}✖ [AzWA]${NC} $1"; }
log_header()  { echo -e "\n${BOLD}${PURPLE}========== $1 ==========${NC}\n"; }

# Package runner detection (prefer bun, fallback to npm)
get_runner() {
    if command -v bun &> /dev/null; then
        echo "bun"
    else
        echo "npm"
    fi
}

# Print Header Banner
show_banner() {
    echo -e "${BOLD}${CYAN}"
    echo "================================================================="
    echo "          AzWA WhatsApp Business Platform — Control Center        "
    echo "================================================================="
    echo -e "${NC}"
}

# Print Usage Help
show_help() {
    show_banner
    echo -e "${BOLD}Usage:${NC} ./az.sh <command>"
    echo ""
    echo -e "${BOLD}${GREEN}🚀 Deployment & Production:${NC}"
    echo "  deploy          Full end-to-end deployment (Build -> Nginx -> SSL -> PM2)"
    echo "  start           Start production process with PM2"
    echo "  stop            Stop PM2 production process"
    echo "  restart         Restart PM2 application (Zero-downtime reload)"
    echo "  status          Show application, PM2, and Nginx status"
    echo "  logs            View live production logs (PM2)"
    echo ""
    echo -e "${BOLD}${BLUE}💻 Development & Building:${NC}"
    echo "  dev             Start local development server"
    echo "  build           Build production application"
    echo "  typecheck       Run TypeScript typechecking"
    echo "  check           Run full code check (typecheck, lint, audit, build)"
    echo "  clean           Clean build artifacts (.output, node_modules/.cache)"
    echo ""
    echo -e "${BOLD}${PURPLE}🌐 Nginx & SSL (Certbot):${NC}"
    echo "  nginx-setup     Configure Nginx reverse proxy symlinks"
    echo "  nginx-test      Validate Nginx configuration syntax"
    echo "  ssl             Issue/Renew Certbot SSL certificate"
    echo ""
    echo -e "${BOLD}${YELLOW}🗄️ Database & Supabase:${NC}"
    echo "  db-start        Start local Supabase stack"
    echo "  db-stop         Stop local Supabase stack"
    echo "  db-status       Check local Supabase status"
    echo "  db-env          Verify .env and .env.local database connections"
    echo ""
}

# --- Action Implementations ---

cmd_dev() {
    log_header "Starting Local Development Server"
    RUNNER=$(get_runner)
    $RUNNER run dev
}

cmd_build() {
    log_header "Building Production Bundle"
    RUNNER=$(get_runner)
    $RUNNER install
    $RUNNER run build
    log_success "Build completed successfully!"
}

cmd_typecheck() {
    log_header "Running TypeScript Typecheck"
    RUNNER=$(get_runner)
    $RUNNER run typecheck
}

cmd_check() {
    log_header "Running Comprehensive Code Check"
    RUNNER=$(get_runner)
    $RUNNER run check
}

cmd_start() {
    log_header "Starting PM2 Production Application"
    if ! command -v pm2 &> /dev/null; then
        log_warn "PM2 not found globally. Installing PM2..."
        sudo npm install -g pm2
    fi
    pm2 startOrReload "${PM2_CONFIG}"
    pm2 save
    log_success "PM2 process started!"
}

cmd_stop() {
    log_header "Stopping Application"
    if command -v pm2 &> /dev/null; then
        pm2 stop azwa-app || true
        log_success "Application stopped."
    fi
}

cmd_restart() {
    log_header "Reloading Application (Zero-Downtime)"
    if command -v pm2 &> /dev/null; then
        pm2 reload azwa-app || pm2 start "${PM2_CONFIG}"
        log_success "Application reloaded!"
    else
        cmd_start
    fi
}

cmd_status() {
    show_banner
    log_header "System & Application Status"
    if command -v pm2 &> /dev/null; then
        echo -e "${BOLD}--- PM2 Processes ---${NC}"
        pm2 status azwa-app || true
    fi
    echo ""
    if command -v systemctl &> /dev/null; then
        echo -e "${BOLD}--- Nginx Service ---${NC}"
        systemctl status nginx --no-pager || true
    fi
}

cmd_logs() {
    log_header "Streaming PM2 Logs (Press Ctrl+C to exit)"
    if command -v pm2 &> /dev/null; then
        pm2 logs azwa-app
    else
        log_error "PM2 is not installed."
    fi
}

cmd_nginx_setup() {
    log_header "Configuring Nginx Reverse Proxy"
    if [ ! -f "${NGINX_SRC}" ]; then
        log_error "Nginx config template not found at ${NGINX_SRC}"
        exit 1
    fi
    log_info "Copying ${NGINX_SRC} -> ${NGINX_DEST}"
    sudo cp "${NGINX_SRC}" "${NGINX_DEST}"
    log_info "Creating symlink -> ${NGINX_LINK}"
    sudo ln -sf "${NGINX_DEST}" "${NGINX_LINK}"
    sudo nginx -t
    sudo systemctl reload nginx
    log_success "Nginx configured and reloaded!"
}

cmd_nginx_test() {
    log_header "Testing Nginx Syntax"
    sudo nginx -t
}

cmd_ssl() {
    log_header "Issuing/Updating SSL Certificate via Certbot"
    log_info "Certbot will update Nginx config for domain: ${DOMAIN}"
    sudo certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --redirect --register-unsafely-without-email || {
        log_warn "Certbot encountered an issue. Ensure domain points to server IP."
    }
    log_success "Certbot SSL processing completed!"
}

cmd_deploy() {
    log_header "Full Automatic Deployment Pipeline"
    cmd_build
    cmd_nginx_setup
    cmd_ssl
    cmd_restart
    log_success "Deploy finished! Live at https://${DOMAIN}"
}

cmd_db_start() {
    log_header "Starting Local Supabase Stack"
    npx supabase start
}

cmd_db_stop() {
    log_header "Stopping Local Supabase Stack"
    npx supabase stop
}

cmd_db_status() {
    log_header "Local Supabase Status"
    npx supabase status
}

cmd_db_env() {
    log_header "Checking Database Environment Setup"
    if [ -f "${APP_DIR}/.env.local" ]; then
        log_success ".env.local found!"
        grep -E "SUPABASE|DATABASE|PG" "${APP_DIR}/.env.local" || true
    elif [ -f "${APP_DIR}/.env" ]; then
        log_success ".env found!"
        grep -E "SUPABASE|DATABASE|PG" "${APP_DIR}/.env" || true
    else
        log_error "No .env or .env.local file found!"
    fi
}

cmd_clean() {
    log_header "Cleaning Build Artifacts"
    rm -rf "${APP_DIR}/.output" "${APP_DIR}/.tanstack" "${APP_DIR}/node_modules/.cache"
    log_success "Clean complete!"
}

# --- Main CLI Router ---
main() {
    cd "${APP_DIR}"
    COMMAND="${1:-}"

    case "${COMMAND}" in
        dev)          cmd_dev ;;
        build)        cmd_build ;;
        typecheck)    cmd_typecheck ;;
        check)        cmd_check ;;
        start)        cmd_start ;;
        stop)         cmd_stop ;;
        restart|reload) cmd_restart ;;
        status)       cmd_status ;;
        logs)         cmd_logs ;;
        nginx-setup)  cmd_nginx_setup ;;
        nginx-test)   cmd_nginx_test ;;
        ssl)          cmd_ssl ;;
        deploy)       cmd_deploy ;;
        db-start)     cmd_db_start ;;
        db-stop)      cmd_db_stop ;;
        db-status)    cmd_db_status ;;
        db-env)       cmd_db_env ;;
        clean)        cmd_clean ;;
        help|--help|-h) show_help ;;
        "")           show_help ;;
        *)
            log_error "Unknown command: ${COMMAND}"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
