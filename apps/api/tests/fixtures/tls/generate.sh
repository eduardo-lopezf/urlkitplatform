#!/usr/bin/env bash
# Regenerates the TEST-ONLY certificates of this folder (002/T004). Never use them outside tests.
#
#   bash apps/api/tests/fixtures/tls/generate.sh
#
# Works with OpenSSL >= 3.0. Validity windows that are not "from now" use `openssl ca` with
# -startdate/-enddate, because `openssl x509 -not_before` only exists from 3.4.
set -euo pipefail

OUT="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

key() { openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$1" 2>/dev/null; }

cat > ca.cnf <<'EOF'
[ ca ]
default_ca = test_ca
[ test_ca ]
dir = .
database = index.txt
new_certs_dir = .
serial = serial
default_md = sha256
policy = any
unique_subject = no
copy_extensions = none
[ any ]
commonName = supplied
[ v3_ca ]
basicConstraints = critical, CA:true
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always
[ leaf_localhost ]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = serverAuth
subjectAltName = DNS:localhost, IP:127.0.0.1
[ leaf_other ]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = serverAuth
subjectAltName = DNS:other.test
EOF

# SignedCertificateTimestampList with one fake SCT (RFC 6962 §3.3), wrapped in the inner OCTET
# STRING the extension value carries. Only its presence and count matter to the tests.
sct="00"                                        # version v1
sct+="$(printf '11%.0s' $(seq 1 32))"           # log id (32 bytes)
sct+="0000018c00000000"                         # timestamp
sct+="0000"                                     # no extensions
sct+="0403"                                     # sha256 / ecdsa
sct+="0004deadbeef"                             # signature (4 bytes)
sct_len=$(printf '%04x' $(( ${#sct} / 2 )))
list="${sct_len}${sct}"
list_len=$(printf '%04x' $(( ${#list} / 2 )))
payload="${list_len}${list}"
octet_len=$(printf '%02x' $(( ${#payload} / 2 )))
SCT_EXT="1.3.6.1.4.1.11129.2.4.2=DER:04${octet_len}${payload}"
# OpenSSL 3.0 drops this extension when it comes from a config section, but keeps it from
# `req -addext`. The SCT leaf therefore carries it in its CSR and is signed by a CA section that
# copies requested extensions.
cat >> ca.cnf <<'EOF'
[ test_ca_copy ]
dir = .
database = index.txt
new_certs_dir = .
serial = serial
default_md = sha256
policy = any
unique_subject = no
copy_extensions = copy
EOF

reset_db() { : > index.txt; printf '%s\n' "$(openssl rand -hex 8)" > serial; }

# Root CA (self-signed) and intermediate.
key root.key
openssl req -new -x509 -key root.key -subj "/CN=URLkit Test Root" -days 3650 \
  -config ca.cnf -extensions v3_ca -out root.pem
key intermediate.key
openssl req -new -key intermediate.key -subj "/CN=URLkit Test Intermediate" -out intermediate.csr
reset_db
openssl ca -batch -config ca.cnf -cert root.pem -keyfile root.key -days 3650 \
  -extensions v3_ca -in intermediate.csr -out intermediate.pem -notext 2>/dev/null

# leaf <name> <extensions> [extra `openssl ca` args...]
leaf() {
  local name=$1 ext=$2; shift 2
  key "$name.key"
  openssl req -new -key "$name.key" -subj "/CN=$name" -out "$name.csr"
  reset_db
  openssl ca -batch -config ca.cnf -cert intermediate.pem -keyfile intermediate.key \
    -extensions "$ext" -in "$name.csr" -out "$name.pem" -notext "$@" 2>/dev/null
}

leaf valid leaf_localhost -days 3650
leaf expired leaf_localhost -startdate 20200101000000Z -enddate 20200201000000Z
leaf not-yet-valid leaf_localhost -startdate 20990101000000Z -enddate 20991231000000Z
leaf other-name leaf_other -days 3650
leaf sha1 leaf_localhost -days 3650 -md sha1
key sct.key
openssl req -new -key sct.key -subj "/CN=sct" -addext "$SCT_EXT" -out sct.csr
reset_db
openssl ca -batch -config ca.cnf -name test_ca_copy -cert intermediate.pem \
  -keyfile intermediate.key -extensions leaf_localhost -days 3650 \
  -in sct.csr -out sct.pem -notext 2>/dev/null

# Self-signed leaf, outside the test CA.
key self-signed.key
openssl req -new -x509 -key self-signed.key -subj "/CN=localhost" -days 3650 \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" -out self-signed.pem

# Chains as a server would send them. `no-intermediate` sends the leaf alone.
for name in valid expired not-yet-valid other-name sha1 sct; do
  cat "$name.pem" intermediate.pem > "$OUT/$name.chain.pem"
  cp "$name.key" "$OUT/$name.key"
done
cp valid.pem "$OUT/no-intermediate.chain.pem"
cp valid.key "$OUT/no-intermediate.key"
cp self-signed.pem "$OUT/self-signed.chain.pem"
cp self-signed.key "$OUT/self-signed.key"
cp root.pem "$OUT/root.pem"
cp intermediate.pem "$OUT/intermediate.pem"

echo "TLS fixtures written to $OUT"
