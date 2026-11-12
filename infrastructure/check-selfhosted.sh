#!/usr/bin/env bash
# Checks a running `selfhosted` stack (T110 locally, T111 on the VPS). The same script, the same
# checks and the same expected results in both places: only API_DOMAIN in .env changes.
#
#   docker compose --profile selfhosted up -d --build
#   infrastructure/check-selfhosted.sh
#
# It only reads: it never changes rules, containers or files. Each run spends one Redirect
# Inspector inspection of the quota (scenario 6). Exit code 1 if any check fails.
set -u
cd "$(dirname "$0")/.."

SUBNET=172.30.0.0/24 # the egress network in docker-compose.yml
API_DOMAIN=${API_DOMAIN:-$(sed -n 's/^API_DOMAIN=//p' .env 2>/dev/null | tail -1)}
API_DOMAIN=${API_DOMAIN:-localhost}
BASE="https://$API_DOMAIN"
# `localhost` gets its certificate from Caddy's local CA, which this machine does not trust.
INSECURE=''
[ "$API_DOMAIN" = localhost ] && INSECURE=-k
# A marker client IP from a documentation range: it must not reach any log.
MARK_IP=203.0.113.77
FAILED=0

ok() { printf '  ✓ %s\n' "$1"; }
ko() { printf '  ✗ %s: %s\n' "$1" "$2"; FAILED=1; }
http() { curl -s -m 20 $INSECURE "$@"; }
compose() { docker compose --profile selfhosted "$@"; }
api_node() { compose exec -T api node -e "$1"; }
# Packet counter of the DROP rule from the egress subnet to a range.
drops() {
  compose exec -T egress-guard iptables -L DOCKER-USER -v -n -x 2>/dev/null \
    | awk -v s="$SUBNET" -v d="$1" '$3 == "DROP" && $8 == s && $9 == d { print $1; exit }'
}

echo "selfhosted · $API_DOMAIN"
SINCE=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo 'Servicios'
running=$(compose ps --status running --services 2>/dev/null)
for s in redis api egress-guard caddy; do
  if printf '%s\n' "$running" | grep -qx "$s"; then ok "$s en marcha"; else ko "$s" 'no está en marcha'; fi
done
if compose port --protocol udp caddy 443 >/dev/null 2>&1; then
  ok 'Caddy publica 443/udp (HTTP/3)'
else
  ko '443/udp' 'Caddy no lo publica'
fi

echo 'Reglas de salida'
rules=$(compose exec -T egress-guard iptables -S DOCKER-USER 2>/dev/null | grep -c -- "-s $SUBNET")
if [ "$rules" -eq 16 ]; then ok "16 reglas sobre $SUBNET"; else ko 'reglas' "$rules de 16"; fi
# A rule that exists but is never traversed (another iptables backend, another chain) blocks
# nothing: the connection must move the DROP counter, not just fail.
before=$(drops 10.0.0.0/8)
api_node "fetch('http://10.255.255.1/', { signal: AbortSignal.timeout(3000) })
  .then(() => process.exit(1), () => process.exit(0))" >/dev/null 2>&1
blocked=$?
after=$(drops 10.0.0.0/8)
if [ "$blocked" -eq 0 ] && [ -n "$before" ] && [ "${after:-0}" -gt "$before" ]; then
  ok "la API no llega a 10.255.255.1 y el contador de DROP sube ($before → $after)"
else
  ko 'bloqueo' "conexión fallida=$([ "$blocked" -eq 0 ] && echo sí || echo no), contador ${before:-?} → ${after:-?}"
fi
if api_node "fetch('http://1.1.1.1/', { redirect: 'manual', signal: AbortSignal.timeout(5000) })
  .then(() => process.exit(0), () => process.exit(1))" >/dev/null 2>&1; then
  ok 'la API llega a una dirección pública (1.1.1.1)'
else
  ko 'salida pública' 'la API no llega a 1.1.1.1'
fi

echo 'API a través de Caddy'
out=$(http -X POST "$BASE/v1/clean" -H 'content-type: application/json' \
  -H "x-forwarded-for: $MARK_IP" -d '{"url":"https://ejemplo.com/?utm_source=x&id=1"}')
case "$out" in
  *'"output":"https://ejemplo.com/?id=1"'*) ok '/v1/clean quita utm_source' ;;
  *) ko '/v1/clean' "${out:-sin respuesta}" ;;
esac
code=$(http -o /dev/null -w '%{http_code}' "http://$API_DOMAIN/")
if [ "$code" = 308 ]; then ok 'HTTP → HTTPS (308)'; else ko 'redirección' "$code"; fi
code=$(http -o /dev/null -w '%{http_code}' "$BASE/internal/metrics")
if [ "$code" = 404 ]; then ok '/internal/metrics no se expone (404)'; else ko '/internal/metrics' "$code"; fi
out=$(http -X POST "$BASE/v1/inspect" -H 'content-type: application/json' \
  -H "x-forwarded-for: $MARK_IP" -d '{"url":"http://169.254.169.254/"}')
case "$out" in
  *'"stopReason":"blocked"'*) ok 'escenario 6: 169.254.169.254 bloqueado por el código' ;;
  *'quota.exceeded'*) ko 'escenario 6' 'cuota de inspecciones agotada; repite en una hora' ;;
  *) ko 'escenario 6' "${out:-sin respuesta}" ;;
esac

echo 'Logs (desde el inicio de esta comprobación)'
logs=$(compose logs --since "$SINCE" --no-log-prefix 2>&1)
leaks=''
for needle in "$MARK_IP" utm_source 169.254.169.254 10.255.255.1 '"remote_ip"' '"client_ip"' '"uri"'; do
  printf '%s' "$logs" | grep -qF -- "$needle" && leaks="$leaks $needle"
done
if [ -z "$leaks" ]; then ok 'sin IPs, URLs ni datos de la petición'; else ko 'logs' "aparecen:$leaks"; fi

echo
if [ "$FAILED" -eq 0 ]; then echo 'Todo correcto.'; else echo 'Hay comprobaciones fallidas.'; exit 1; fi
