#!/bin/sh
# Egress firewall for the API/inspector network (second barrier, Principio V).
# Drops traffic from the egress subnet towards internal, loopback, link-local, CGNAT, multicast
# and reserved ranges. It does not replace the IP validation in apps/api/src/inspect/safe-fetch.ts.
set -eu
SUBNET="$1"
apk add --no-cache iptables >/dev/null
for range in 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 \
  192.0.0.0/24 192.0.2.0/24 192.168.0.0/16 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 \
  224.0.0.0/4 240.0.0.0/4; do
  iptables -C DOCKER-USER -s "$SUBNET" -d "$range" -j DROP 2>/dev/null \
    || iptables -I DOCKER-USER -s "$SUBNET" -d "$range" -j DROP
done
# Traffic between containers of the egress network itself (Caddy -> API) stays allowed. Inserted
# last so it sits at the top of the chain.
iptables -C DOCKER-USER -s "$SUBNET" -d "$SUBNET" -j ACCEPT 2>/dev/null \
  || iptables -I DOCKER-USER -s "$SUBNET" -d "$SUBNET" -j ACCEPT
# Replies to connections opened from outside (a client or load balancer on a private address
# calling the published port) must pass; new connections towards those ranges stay dropped.
iptables -C DOCKER-USER -s "$SUBNET" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT \
  2>/dev/null \
  || iptables -I DOCKER-USER -s "$SUBNET" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
# The egress network has no IPv6 (enable_ipv6 is off in docker-compose.yml), so there is no IPv6
# path to filter. If IPv6 is ever enabled there, add the equivalent ip6tables rules here.
echo "egress-guard: rules applied to $SUBNET"
