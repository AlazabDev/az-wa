#!/usr/bin/env bash
set -u
set -o pipefail
umask 077

APP_DIR="${APP_DIR:-/mnt/apps/az-wa}"
PM2_APP="${PM2_APP:-azwa-app}"
DOMAIN="${DOMAIN:-wa.alazab.com}"
PORT="${PORT:-8085}"
ENV_FILE="${ENV_FILE:-/etc/az-wa/az-wa.env}"
SINCE="${SINCE:-24 hours ago}"
LOG_LINES="${LOG_LINES:-600}"
CURL_TIMEOUT="${CURL_TIMEOUT:-12}"
OUT_BASE="${OUT_BASE:-$PWD}"

TS="$(date '+%Y%m%d_%H%M%S')"
HOST_SHORT="$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo host)"
WORKDIR="$(mktemp -d "/tmp/azwa-diag.${TS}.XXXXXX")"
REPORT="${WORKDIR}/AZWA_DIAG_${HOST_SHORT}_${TS}"
mkdir -p "$REPORT"/{01-system,02-project,03-runtime,04-nginx,05-network,06-env,07-security,08-http,09-db-clients}
SUMMARY="$REPORT/00-SUMMARY.txt"
ERROR_INDEX="$REPORT/90-ERRORS-INDEX.txt"
RUNLOG="$REPORT/99-COLLECTOR.log"

log(){ printf '[%s] %s\n' "$(date '+%F %T')" "$*" | tee -a "$RUNLOG"; }
have(){ command -v "$1" >/dev/null 2>&1; }

# Non-interactive sudo shells may not inherit the NVM bin path even while the
# production PM2 daemon is running from NVM. Load it before runtime checks.
if ! command -v pm2 >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1090
  source "$HOME/.nvm/nvm.sh"
  nvm use 24 >/dev/null 2>&1 || true
fi

if [ "${EUID:-$(id -u)}" -eq 0 ]; then ROOT=(); elif have sudo && sudo -n true >/dev/null 2>&1; then ROOT=(sudo -n); else ROOT=(); fi

redact(){
  sed -E \
    -e 's#(postgres(ql)?://[^:/[:space:]]+:)[^@/[:space:]]+@#\1***REDACTED***@#gI' \
    -e 's#(Authorization:[[:space:]]*(Bearer|Basic)[[:space:]]+)[^[:space:]]+#\1***REDACTED***#gI' \
    -e 's#\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b#***REDACTED_JWT***#g' \
    -e 's#\bEAA[A-Za-z0-9]{20,}\b#***REDACTED_META_TOKEN***#g' \
    -e 's#\bsb_(secret|publishable)_[A-Za-z0-9._-]{10,}\b#***REDACTED_SUPABASE_KEY***#gI' \
    -e 's#((APP_SECRET|CLIENT_SECRET|SERVICE_ROLE(_KEY)?|SUPABASE_SERVICE_ROLE_KEY|JWT_SECRET|VERIFY_TOKEN|ACCESS_TOKEN|SYSTEM_USER_TOKEN|API_KEY|PASSWORD|PASS|SECRET|TOKEN|PRIVATE_KEY)[[:space:]]*[:=][[:space:]]*)[^,;[:space:]"}]+#\1***REDACTED***#gI'
}

capture(){ local f="$1"; shift; { printf '$'; printf ' %q' "$@"; printf '\n\n'; "$@" 2>&1; } | redact > "$f"; return ${PIPESTATUS[0]}; }
capture_shell(){ local f="$1"; shift; local c="$*"; { printf '$ %s\n\n' "$c"; bash -lc "$c" 2>&1; } | redact > "$f"; return ${PIPESTATUS[0]}; }
safe_stat(){ if [ -e "$1" ]; then stat -c '%A %a %U:%G %s bytes %y %n' "$1" 2>/dev/null || ls -ld "$1"; else echo "MISSING: $1"; fi; }
section(){ printf '\n===== %s =====\n' "$*" >> "$SUMMARY"; }
check_line(){ printf '%-5s | %-28s | %s\n' "$1" "$2" "$3" >> "$SUMMARY"; }
cleanup(){ rm -rf "$WORKDIR" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

log "AZWA diagnostic collection started"
log "APP_DIR=$APP_DIR | PM2_APP=$PM2_APP | DOMAIN=$DOMAIN | PORT=$PORT"

if [ ! -f "$APP_DIR/package.json" ]; then
  for c in /mnt/apps/az-wa /var/www/apps/az-wa /var/www/az-wa /opt/az-wa /srv/az-wa; do
    if [ -f "$c/package.json" ]; then APP_DIR="$c"; log "Auto-detected APP_DIR=$APP_DIR"; break; fi
  done
fi

NGINX_MATCH_FILES=()
for d in /etc/nginx/sites-enabled /etc/nginx/conf.d; do
  [ -d "$d" ] || continue
  while IFS= read -r f; do NGINX_MATCH_FILES+=("$f"); done < <(grep -RIl "$DOMAIN" "$d" 2>/dev/null || true)
done
if [ "${#NGINX_MATCH_FILES[@]}" -gt 0 ]; then
  DETECTED_PORT="$(grep -hEo 'proxy_pass[[:space:]]+https?://(127\.0\.0\.1|localhost):[0-9]+' "${NGINX_MATCH_FILES[@]}" 2>/dev/null | grep -Eo '[0-9]+$' | head -n1 || true)"
  if [[ "${DETECTED_PORT:-}" =~ ^[0-9]+$ ]]; then PORT="$DETECTED_PORT"; log "Detected upstream PORT=$PORT from Nginx"; fi
fi

cat > "$SUMMARY" <<EOF
AZWA PRODUCTION DIAGNOSTIC SUMMARY
Generated : $(date --iso-8601=seconds 2>/dev/null || date)
Host      : $(hostname -f 2>/dev/null || hostname)
User      : $(id -un) (uid=$(id -u))
App dir   : $APP_DIR
PM2 app   : $PM2_APP
Domain    : $DOMAIN
Port      : $PORT
Window    : $SINCE
Mode      : READ-ONLY / NO RESTART / NO INSTALL / NO BUILD / NO DB MUTATION
EOF

log "Collecting system diagnostics"
capture "$REPORT/01-system/os.txt" bash -lc 'uname -a; echo; cat /etc/os-release 2>/dev/null || true' || true
capture "$REPORT/01-system/resources.txt" bash -lc 'uptime; echo; free -h; echo; df -hT; echo; df -ih' || true
capture "$REPORT/01-system/top.txt" bash -lc 'ps -eo pid,ppid,user,%cpu,%mem,rss,vsz,etime,stat,comm,args --sort=-%cpu | head -n 60' || true
capture "$REPORT/01-system/toolchain.txt" bash -lc 'for x in node npm pnpm bun pm2 nginx git curl openssl psql supabase; do printf "%-10s " "$x"; command -v "$x" 2>/dev/null || true; "$x" --version 2>/dev/null | head -n1 || true; done' || true

if have journalctl; then
  "${ROOT[@]}" journalctl -k --since "$SINCE" --no-pager 2>&1 | egrep -i 'oom|out of memory|killed process|segfault|i/o error|filesystem|ext4|xfs|nvme|memory cgroup' | tail -n "$LOG_LINES" | redact > "$REPORT/01-system/kernel-critical.log" || true
  "${ROOT[@]}" journalctl --since "$SINCE" -p warning..alert --no-pager 2>&1 | tail -n "$LOG_LINES" | redact > "$REPORT/01-system/journal-warning-plus.log" || true
fi

log "Collecting project/build state"
if [ -d "$APP_DIR" ]; then
  safe_stat "$APP_DIR" | redact > "$REPORT/02-project/app-dir-stat.txt"
  capture_shell "$REPORT/02-project/project-size.txt" "cd $(printf '%q' "$APP_DIR") && du -sh . && find . -xdev -type f | wc -l" || true
  [ -f "$APP_DIR/package.json" ] && cat "$APP_DIR/package.json" | redact > "$REPORT/02-project/package.json.txt"
  capture_shell "$REPORT/02-project/key-files.txt" "cd $(printf '%q' "$APP_DIR") && for f in package.json package-lock.json pnpm-lock.yaml yarn.lock bun.lock tsconfig.json vite.config.ts vite.config.js .output/server/index.mjs; do if [ -e \"\$f\" ]; then stat -c '%A %a %U:%G %s %y %n' \"\$f\"; else echo \"MISSING \$f\"; fi; done" || true
  capture_shell "$REPORT/02-project/build-output.txt" "cd $(printf '%q' "$APP_DIR") && if [ -d .output ]; then du -sh .output; find .output -maxdepth 3 -type f -printf '%TY-%Tm-%Td %TH:%TM:%TS %s %p\n' | sort | tail -n 120; else echo 'MISSING .output'; fi" || true
  if [ -d "$APP_DIR/.git" ] && have git; then
    capture_shell "$REPORT/02-project/git-state.txt" "cd $(printf '%q' "$APP_DIR") && git branch --show-current && git rev-parse HEAD && git status --short && echo && git log -n 12 --date=iso --pretty=format:'%h %ad %an %s'" || true
  fi
  if have npm; then timeout 25s bash -lc "cd $(printf '%q' "$APP_DIR") && npm ls --depth=0" 2>&1 | redact > "$REPORT/02-project/npm-ls.txt" || true; fi
else
  echo "APP_DIR missing: $APP_DIR" > "$REPORT/02-project/MISSING_APP_DIR.txt"
fi

log "Collecting PM2/runtime state"
capture "$REPORT/03-runtime/processes.txt" bash -lc 'ps auxww | egrep "[p]m2|[n]ode|[b]un|[n]itro|[v]ite" || true' || true
if have pm2; then
  capture "$REPORT/03-runtime/pm2-list.txt" pm2 list || true
  capture "$REPORT/03-runtime/pm2-describe.txt" pm2 describe "$PM2_APP" || true
  timeout 20s pm2 logs "$PM2_APP" --lines "$LOG_LINES" --nostream 2>&1 | redact > "$REPORT/03-runtime/pm2-app.log" || true
  timeout 15s pm2 jlist 2>&1 | redact > "$REPORT/03-runtime/pm2-jlist.json.txt" || true
fi

log "Collecting Nginx diagnostics"
if have nginx; then "${ROOT[@]}" nginx -t 2>&1 | redact > "$REPORT/04-nginx/nginx-test.txt" || true; fi
if [ "${#NGINX_MATCH_FILES[@]}" -gt 0 ]; then
  printf '%s\n' "${NGINX_MATCH_FILES[@]}" > "$REPORT/04-nginx/matching-config-files.txt"
  for f in "${NGINX_MATCH_FILES[@]}"; do
    b="$(echo "$f" | sed 's#/#_#g; s#^_##')"
    { echo "### FILE: $f"; "${ROOT[@]}" cat "$f" 2>&1; } | redact > "$REPORT/04-nginx/${b}.txt" || true
  done
else
  echo "No Nginx config containing $DOMAIN was found." > "$REPORT/04-nginx/NO_DOMAIN_CONFIG_FOUND.txt"
fi
for f in /var/log/nginx/error.log /var/log/nginx/access.log; do
  if "${ROOT[@]}" test -r "$f" 2>/dev/null; then "${ROOT[@]}" tail -n "$LOG_LINES" "$f" 2>&1 | redact > "$REPORT/04-nginx/$(basename "$f").tail.log" || true; fi
done
{
  for f in /var/log/nginx/*.log; do [ -e "$f" ] || continue; "${ROOT[@]}" tail -n 3000 "$f" 2>/dev/null || true; done
} | egrep -i "$DOMAIN|upstream|connect\(\) failed|prematurely closed|timed out| 499 | 500 | 502 | 503 | 504 " | tail -n "$LOG_LINES" | redact > "$REPORT/04-nginx/nginx-targeted-errors.log" || true

log "Collecting network/DNS/TLS state"
if have ss; then capture "$REPORT/05-network/listeners.txt" ss -lntup || true; fi
capture "$REPORT/05-network/domain-resolution.txt" bash -lc "getent ahosts $(printf '%q' "$DOMAIN") 2>/dev/null || true; echo; cat /etc/resolv.conf 2>/dev/null || true" || true
if have openssl; then timeout "$CURL_TIMEOUT"s bash -lc "echo | openssl s_client -connect $(printf '%q' "$DOMAIN"):443 -servername $(printf '%q' "$DOMAIN") 2>/dev/null | openssl x509 -noout -subject -issuer -serial -dates -fingerprint -sha256" 2>&1 | redact > "$REPORT/05-network/tls-certificate.txt" || true; fi

log "Collecting environment metadata (no values)"
{
  echo "Environment file metadata:"; safe_stat "$ENV_FILE"; echo
  echo "Variable names present (VALUES NEVER PRINTED):"
  if "${ROOT[@]}" test -r "$ENV_FILE" 2>/dev/null; then
    "${ROOT[@]}" awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{k=$1; sub(/^[^=]*=/,""); printf "%-44s %s\n",k,(length($0)>0?"SET":"EMPTY")}' "$ENV_FILE" 2>/dev/null | sort
  else
    echo "UNREADABLE OR MISSING"
  fi
} | redact > "$REPORT/06-env/env-presence.txt"
if [ -d "$APP_DIR" ]; then
  capture_shell "$REPORT/06-env/env-files-in-project.txt" "cd $(printf '%q' "$APP_DIR") && find . -xdev -maxdepth 5 -type f \\( -name '.env' -o -name '.env.*' -o -name '*secret*' -o -name '*credential*' \\) -not -path './node_modules/*' -printf '%M %m %u:%g %s %TY-%Tm-%Td_%TH:%TM %p\n' | sort" || true
fi

log "Collecting non-invasive security posture"
capture "$REPORT/07-security/user-and-permissions.txt" bash -lc 'id; echo; umask' || true
if have ss; then capture_shell "$REPORT/07-security/public-listeners.txt" "ss -lntp 2>/dev/null | awk 'NR==1 || \$4 !~ /127\\.0\\.0\\.1|\\[::1\\]/'" || true; fi

probe_url(){
  local label="$1" url="$2" out="$3" body="${3}.body" hdr="${3}.hdr" metrics="${3}.metrics"
  if have curl; then
    curl -k -sS --max-time "$CURL_TIMEOUT" -D "$hdr" -o "$body" \
      -w 'http_code=%{http_code}\nremote_ip=%{remote_ip}\nremote_port=%{remote_port}\ntime_namelookup=%{time_namelookup}\ntime_connect=%{time_connect}\ntime_appconnect=%{time_appconnect}\ntime_starttransfer=%{time_starttransfer}\ntime_total=%{time_total}\nsize_download=%{size_download}\n' \
      "$url" > "$metrics" 2>&1 || true
    { echo "LABEL: $label"; echo "URL: $url"; echo; echo "== METRICS =="; cat "$metrics" 2>/dev/null; echo; echo "== HEADERS =="; cat "$hdr" 2>/dev/null; echo; echo "== BODY FIRST 12KB =="; head -c 12288 "$body" 2>/dev/null; echo; } | redact > "$out"
    rm -f "$body" "$hdr" "$metrics"
  fi
}

log "Running HTTP probes"
probe_url local-root "http://127.0.0.1:${PORT}/" "$REPORT/08-http/local-root.txt"
probe_url public-root "https://${DOMAIN}/" "$REPORT/08-http/public-root.txt"
probe_url local-health "http://127.0.0.1:${PORT}/health" "$REPORT/08-http/local-health.txt"
probe_url public-health "https://${DOMAIN}/health" "$REPORT/08-http/public-health.txt"

log "Collecting DB/client availability only"
{ for x in psql pg_isready supabase; do printf '%-14s : ' "$x"; if have "$x"; then command -v "$x"; "$x" --version 2>/dev/null | head -n1 || true; else echo NOT_FOUND; fi; done; } > "$REPORT/09-db-clients/clients.txt"

log "Building summary"
section "PRIMARY CHECKS"
[ -f "$APP_DIR/package.json" ] && check_line PASS "application directory" "$APP_DIR" || check_line FAIL "application directory" "package.json not found"
NODE_MAJOR=0; have node && NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -ge 24 ] 2>/dev/null; then check_line PASS "Node runtime" "$(node -v)"; else check_line FAIL "Node runtime" "$(node -v 2>/dev/null || echo missing) expected >=24"; fi
[ -f "$APP_DIR/.output/server/index.mjs" ] && check_line PASS "production build" ".output/server/index.mjs exists" || check_line FAIL "production build" ".output/server/index.mjs missing"

if have pm2 && pm2 jlist 2>/dev/null | grep -q "\"name\":\"$PM2_APP\""; then
  PM2_STATUS="$(pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{let a=JSON.parse(d),p=a.find(x=>x.name===process.argv[1]);console.log(p?.pm2_env?.status||"unknown")}catch{console.log("unknown")}})' "$PM2_APP" 2>/dev/null || echo unknown)"
  [ "$PM2_STATUS" = online ] && check_line PASS "PM2 process" "$PM2_APP online" || check_line FAIL "PM2 process" "$PM2_APP status=$PM2_STATUS"
else
  check_line FAIL "PM2 process" "$PM2_APP not found"
fi

if have ss && ss -lnt 2>/dev/null | grep -Eq "[:.]${PORT}[[:space:]]"; then check_line PASS "upstream listener" "port $PORT listening"; else check_line FAIL "upstream listener" "port $PORT not confirmed"; fi
if [ -s "$REPORT/04-nginx/nginx-test.txt" ] && grep -qi 'test is successful' "$REPORT/04-nginx/nginx-test.txt"; then check_line PASS "Nginx config" "nginx -t successful"; else check_line WARN "Nginx config" "success not confirmed"; fi

LOCAL_CODE="$(awk -F= '/^http_code=/{print $2; exit}' "$REPORT/08-http/local-root.txt" 2>/dev/null || true)"
PUBLIC_CODE="$(awk -F= '/^http_code=/{print $2; exit}' "$REPORT/08-http/public-root.txt" 2>/dev/null || true)"
[[ "$LOCAL_CODE" =~ ^[23][0-9][0-9]$ ]] && check_line PASS "local HTTP" "HTTP $LOCAL_CODE" || check_line FAIL "local HTTP" "HTTP ${LOCAL_CODE:-unknown}"
[[ "$PUBLIC_CODE" =~ ^[23][0-9][0-9]$ ]] && check_line PASS "public HTTP" "HTTP $PUBLIC_CODE" || check_line FAIL "public HTTP" "HTTP ${PUBLIC_CODE:-unknown}"

if "${ROOT[@]}" test -r "$ENV_FILE" 2>/dev/null; then
  ENV_MODE="$("${ROOT[@]}" stat -c '%a' "$ENV_FILE" 2>/dev/null || echo unknown)"
  case "$ENV_MODE" in 600|640|400|440) check_line PASS "env permissions" "mode=$ENV_MODE";; *) check_line WARN "env permissions" "mode=$ENV_MODE prefer 600/640";; esac
else
  check_line FAIL "env file" "$ENV_FILE missing/unreadable"
fi

DISK_USE="$(df -P "$APP_DIR" 2>/dev/null | awk 'NR==2{gsub(/%/,"",$5); print $5}' || true)"
if [[ "$DISK_USE" =~ ^[0-9]+$ ]]; then [ "$DISK_USE" -lt 90 ] && check_line PASS "disk capacity" "${DISK_USE}% used" || check_line WARN "disk capacity" "${DISK_USE}% used"; fi
if [ -d "$APP_DIR/.git" ] && have git; then GIT_DIRTY="$(cd "$APP_DIR" && git status --porcelain 2>/dev/null | wc -l)"; [ "$GIT_DIRTY" -eq 0 ] && check_line PASS "git working tree" clean || check_line WARN "git working tree" "$GIT_DIRTY changed/untracked entries"; fi

section "COLLECTED DATA"
check_line INFO "runtime window" "$SINCE"
check_line INFO "secret handling" "all captures redacted"
check_line INFO "mutation policy" "no restart/install/build/DB writes"

log "Generating consolidated error index"
{
  echo "AZWA CONSOLIDATED ERROR / ANOMALY INDEX"
  echo "Generated: $(date --iso-8601=seconds 2>/dev/null || date)"
  echo
  grep -RInE -i --include='*.log' --include='*.txt' \
    '(^|[^a-z])(error|exception|fatal|panic|unhandled|rejection|failed|failure|timeout|timed out|refused|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EADDRINUSE|ENOMEM|out of memory|OOM|segfault|upstream|bad gateway|gateway timeout|HTTP[ =:]*(4[0-9]{2}|5[0-9]{2})|status[ =:]*(4[0-9]{2}|5[0-9]{2})|database.*(error|fail)|webhook.*(error|fail)|invalid signature)([^a-z]|$)' \
    "$REPORT/01-system" "$REPORT/03-runtime" "$REPORT/04-nginx" "$REPORT/05-network" "$REPORT/08-http" 2>/dev/null | head -n 2500 || true
} | redact > "$ERROR_INDEX"

{
  echo
  echo "===== ERROR INDEX STATS ====="
  printf 'Indexed lines : '; grep -vc '^$' "$ERROR_INDEX" 2>/dev/null || true
  printf 'PM2 error hits: '; grep -Eic 'error|exception|fatal|unhandled|rejection|ECONN|ETIME|EADDR|ENOMEM' "$REPORT/03-runtime/pm2-app.log" 2>/dev/null || true
  printf 'Nginx 5xx/upstream hits: '; grep -Eic ' 50[0-9] |upstream|connect\(\) failed|timed out' "$REPORT/04-nginx/nginx-targeted-errors.log" 2>/dev/null || true
} >> "$SUMMARY"

log "Creating manifest"
( cd "$REPORT" && find . -type f ! -name manifest.sha256 -print0 | sort -z | xargs -0 sha256sum ) > "$REPORT/manifest.sha256" 2>/dev/null || true

ARCHIVE_BASE="$OUT_BASE/AZWA_DIAG_${HOST_SHORT}_${TS}"
if have zip; then
  ARCHIVE="${ARCHIVE_BASE}.zip"
  ( cd "$WORKDIR" && zip -q -r "$ARCHIVE" "$(basename "$REPORT")" )
  have unzip && unzip -t "$ARCHIVE" > "${ARCHIVE}.test.txt" 2>&1 || true
else
  ARCHIVE="${ARCHIVE_BASE}.tar.gz"
  tar -C "$WORKDIR" -czf "$ARCHIVE" "$(basename "$REPORT")"
  tar -tzf "$ARCHIVE" >/dev/null 2>&1 || true
fi

ARCHIVE_SHA="$(sha256sum "$ARCHIVE" 2>/dev/null | awk '{print $1}' || true)"
ARCHIVE_SIZE="$(du -h "$ARCHIVE" 2>/dev/null | awk '{print $1}' || true)"
log "Collection complete"
printf '\n============================================================\n'
printf ' AZWA DIAGNOSTIC COMPLETE\n'
printf '============================================================\n'
printf 'Archive : %s\n' "$ARCHIVE"
printf 'Size    : %s\n' "${ARCHIVE_SIZE:-unknown}"
printf 'SHA256  : %s\n' "${ARCHIVE_SHA:-unknown}"
printf '\nUpload this archive back to ChatGPT for production review.\n'
printf 'No service was restarted and no project/database mutation was performed.\n'
