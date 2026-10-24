#!/usr/bin/env bash
# GetCleanStays uptime + error monitor. Runs every minute from a systemd timer (see getcleanstays-watch.timer).
# Pushes alerts to the owner's phone through ntfy. An alert is sent when a check fails twice in a row (2 min), and again when it recovers.
# Config (not in git): /etc/getcleanstays-watch.conf  ->  NTFY_TOPIC=...
# Usage: getcleanstays-watch.sh [run|selftest]
set -uo pipefail
. /etc/getcleanstays-watch.conf
STATE=/var/lib/getcleanstays-watch; mkdir -p "$STATE"
SITE=https://getcleanstays.com; API=https://api.getcleanstays.com; MCP=https://mcp.getcleanstays.com
CONTAINERS=(webapp-api-1 webapp-client-1 webapp-mcp-1 webapp-postgres-1 webapp-caddy-1 cloudflared-family)   # cloudflared-family = the Cloudflare tunnel that carries all public traffic
now=$(date +%s)

notify() { # title priority tags message
  curl -fsS -m 20 -H "Title: $1" -H "Priority: $2" -H "Tags: $3" -d "$4" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null || echo "ntfy send failed"
}

# result <name> <ok 0|1> <message>: failing twice in a row -> DOWN alert; first success afterwards -> RECOVERED
result() {
  local name=$1 ok=$2 msg=$3
  local f="$STATE/$name.fails" a="$STATE/$name.alerted"
  local fails=0; [ -f "$f" ] && fails=$(cat "$f")
  if [ "$ok" = 0 ]; then
    echo 0 >"$f"
    if [ -f "$a" ]; then rm -f "$a"; notify "GetCleanStays: $name recovered" default white_check_mark "$msg"; fi
  else
    fails=$((fails+1)); echo "$fails" >"$f"
    if [ "$fails" -ge 2 ] && [ ! -f "$a" ]; then touch "$a"; notify "GetCleanStays DOWN: $name" urgent rotating_light "$msg (failing for $fails min)"; fi
  fi
}

# warn_once <key> <seconds between repeats> <title> <message>
warn_once() {
  local f="$STATE/warn.$1"; local last=0; [ -f "$f" ] && last=$(cat "$f")
  if [ $((now-last)) -ge "$2" ]; then echo "$now" >"$f"; notify "$3" high warning "$4"; fi
}

check_http() { # name url grep
  local body; body=$(curl -fsS -m 10 -L "$2" 2>&1); local rc=$?
  if [ $rc -eq 0 ] && echo "$body" | grep -q "$3"; then result "$1" 0 "$1 is back"; else result "$1" 1 "$2 did not answer correctly (curl exit $rc)"; fi
}

run_checks() {
  check_http website "$SITE/login" "CleanStay"
  check_http api "$API/api/health?deep=1" '"db":"ok"'
  check_http connector "$MCP/health" '"status":"ok"'

  for c in "${CONTAINERS[@]}"; do
    st=$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo missing)
    if [ "$st" = running ]; then result "container-$c" 0 "$c is running again"; else result "container-$c" 1 "$c is $st"; fi
    rc=$(docker inspect -f '{{.RestartCount}}' "$c" 2>/dev/null || echo 0); prev=0; [ -f "$STATE/restarts.$c" ] && prev=$(cat "$STATE/restarts.$c"); echo "$rc" >"$STATE/restarts.$c"
    [ "$rc" -gt "$prev" ] && warn_once "restart-$c" 600 "GetCleanStays: $c restarted" "$c restarted ($prev -> $rc). Check: docker logs --tail 50 $c"
  done

  # TLS certificates: warn at 14 days, once a day
  for h in getcleanstays.com api.getcleanstays.com mcp.getcleanstays.com; do
    end=$(echo | timeout 10 openssl s_client -servername "$h" -connect "$h:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
    if [ -n "$end" ]; then days=$(( ($(date -d "$end" +%s)-now)/86400 )); [ "$days" -lt 14 ] && warn_once "tls-$h" 86400 "GetCleanStays: certificate for $h expires in $days days" "Caddy should renew it automatically; check: docker logs --tail 50 webapp-caddy-1"; fi
  done

  # disk space
  use=$(df --output=pcent / | tail -1 | tr -dc 0-9)
  if [ "$use" -ge 92 ]; then warn_once disk-crit 3600 "GetCleanStays: disk $use% full" "The server disk is almost full."; elif [ "$use" -ge 85 ]; then warn_once disk 86400 "GetCleanStays: disk $use% full" "Free some space soon."; fi

  # errors in the API log over the last 2 minutes (the app logs these tags when something real fails)
  logs=$(docker logs --since 2m webapp-api-1 2>&1)
  for pat in '\[unhandled\]' 'database check failed' 'Failed to send' 'SMS failed' 'Resend error' 'Resend rejected' 'PrismaClientInitializationError' 'ECONNREFUSED.*5432'; do
    n=$(echo "$logs" | grep -cE "$pat")
    if [ "$n" -gt 0 ]; then ex=$(echo "$logs" | grep -E "$pat" | tail -1 | cut -c1-160); warn_once "log-${pat//[^a-zA-Z]/}" 1800 "GetCleanStays errors: $pat ($n in 2 min)" "$ex"; fi
  done

  # attack signals from the security-event log (last 10 min): many failed sign-ins overall, or from one address
  q() { docker exec -i webapp-postgres-1 sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB" -tA -F" " -c "$0"' "$1" 2>/dev/null; }
  tot=$(q "select count(*) from \"SecurityEvent\" where type='login_failed' and \"createdAt\" > now() - interval '10 minutes'")
  if [ "${tot:-0}" -ge 40 ]; then warn_once login-burst 3600 "GetCleanStays: $tot failed sign-ins in 10 min" "Possible password-guessing. See Account > or query SecurityEvent (login_failed)."; fi
  top=$(q "select ip, count(*) from \"SecurityEvent\" where type in ('login_failed','csrf_blocked','rate_limited') and \"createdAt\" > now() - interval '10 minutes' group by ip order by 2 desc limit 1")
  set -- $top; if [ -n "${2:-}" ] && [ "$2" -ge 25 ]; then warn_once "ip-$1" 3600 "GetCleanStays: $2 blocked/failed requests from $1" "One address is hammering the app in the last 10 min."; fi
}

case "${1:-run}" in
  run) run_checks ;;
  selftest) notify "GetCleanStays monitor: test alert" default test_tube "This is a test. Monitoring is installed and can reach your phone."; ;;
  *) echo "usage: $0 run|selftest"; exit 2 ;;
esac
