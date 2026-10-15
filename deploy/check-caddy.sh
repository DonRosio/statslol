#!/usr/bin/env bash
# Tries the Caddy configuration of the server (deploy/server/etc/caddy) on this computer, in a
# throwaway container of the same image as production, before it is installed:
#   1. the whole configuration is valid (the real Caddyfile, statslol.caddy and security.caddy);
#   2. the shared blocks of security.caddy do what they say, on every kind of answer (a page, a
#      password asked, a redirection, a bad gateway, a 404): the security headers are there, and
#      Caddy's Server header is not.
#   deploy/check-caddy.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
caddy_dir=$here/server/etc/caddy
# The image of Caddy in production (the one of the web app, which also holds the files).
image=$(grep -m 1 -oE 'caddy:[0-9][^ ]*' "$here/../apps/web/Dockerfile")
work=$(mktemp -d)
container=statslol-check-caddy-$$
trap 'docker rm --force "$container" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
failures=0

fail() {
  echo "  FAIL: $*" >&2
  failures=$((failures + 1))
}

hash=$(docker run --rm "$image" caddy hash-password --plaintext secret)

echo "1. The configuration of the server is valid"
# A copy of the folder, with the list of friends that the server keeps apart (a name and the
# hash of a password).
cp -r "$caddy_dir" "$work/etc-caddy"
echo "friend $hash" >"$work/etc-caddy/statslol-friends"
# Plume Lite's block lives in its own repository: an empty file lets the import resolve.
: >"$work/etc-caddy/plume-lite.caddy"
if docker run --rm \
  --volume "$work/etc-caddy:/etc/caddy:ro" \
  "$image" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>"$work/validate.log"; then
  echo "  ok"
else
  fail "caddy validate: $(tail -n 3 "$work/validate.log")"
fi

echo "2. The shared blocks, on every kind of answer"
cat >"$work/Caddyfile" <<TEST
{
	auto_https off
	admin off
}
import /etc/caddy/security.caddy

# Everything: base and strict, a password, a page open to all.
:8081 {
	import security_base
	import security_strict
	@private not path /open
	basic_auth @private {
		friend $hash
	}
	respond /open "ok"
}
# A redirection, with the base only.
:8082 {
	import security_base
	redir https://example.com{uri} permanent
}
# A bad gateway: nothing listens behind.
:8083 {
	import security_base
	reverse_proxy 127.0.0.1:9
}
# A 404.
:8084 {
	import security_base
	respond /missing 404
	respond "ok"
}
# A proxied answer that works: Caddy adds a Via header of its own, hide_server removes it.
:8086 {
	import security_base
	reverse_proxy 127.0.0.1:8087
}
:8087 {
	respond "ok"
}
# A site that sends its headers itself (hide_server only): it must not get the others.
:8085 {
	import hide_server
	header Permissions-Policy "microphone=(self)"
	respond "ok"
}
TEST
docker run --detach --name "$container" \
  --publish 127.0.0.1:18081-18086:8081-8086 \
  --volume "$work/Caddyfile:/etc/caddy/Caddyfile:ro" \
  --volume "$caddy_dir/security.caddy:/etc/caddy/security.caddy:ro" \
  "$image" >/dev/null
for _ in $(seq 30); do
  curl --silent --output /dev/null "http://127.0.0.1:18081/open" && break
  sleep 0.5
done

# Asks for a page, and checks its status and headers.
#   check <port> <path> <status> <headers that must be there>... [-- <headers that must not>...]
check() {
  local port=$1 path=$2 status=$3
  shift 3
  local headers
  headers=$(curl --silent --include --max-time 5 "http://127.0.0.1:$port$path" | sed '/^\r$/q' | tr -d '\r' | tr 'A-Z' 'a-z')
  local label="port $port $path"
  grep -q "^http/1.1 $status" <<<"$headers" || fail "$label: expected status $status, got $(head -n 1 <<<"$headers")"
  grep -q '^server:' <<<"$headers" && fail "$label: has a Server header"
  grep -q '^via:' <<<"$headers" && fail "$label: has a Via header"
  local expecting=present name
  for name in "$@"; do
    if [[ $name == -- ]]; then
      expecting=absent
      continue
    fi
    name=$(tr 'A-Z' 'a-z' <<<"$name")
    if [[ $expecting == present ]]; then
      grep -q "^${name%%:*}:" <<<"$headers" || fail "$label: lacks ${name%%:*}"
    else
      grep -q "^${name%%:*}:" <<<"$headers" && fail "$label: has ${name%%:*}, which it must not"
    fi
  done
  return 0
}

all=(Strict-Transport-Security X-Content-Type-Options Referrer-Policy Permissions-Policy X-Frame-Options)
check 18081 / 401 "${all[@]}" Cross-Origin-Opener-Policy Cross-Origin-Resource-Policy WWW-Authenticate
check 18081 /open 200 "${all[@]}" Cross-Origin-Opener-Policy Cross-Origin-Resource-Policy
check 18082 /x 301 "${all[@]}" -- Cross-Origin-Opener-Policy
check 18083 / 502 "${all[@]}" -- Cross-Origin-Opener-Policy
check 18084 /missing 404 "${all[@]}"
check 18084 / 200 "${all[@]}"
check 18086 / 200 "${all[@]}"
# The strict values replace the base ones.
strict=$(curl --silent --include --max-time 5 "http://127.0.0.1:18081/open" | tr -d '\r' | tr 'A-Z' 'a-z')
grep -q '^x-frame-options: deny$' <<<"$strict" || fail "strict: X-Frame-Options is not DENY"
grep -q '^referrer-policy: no-referrer$' <<<"$strict" || fail "strict: Referrer-Policy is not no-referrer"
# A site with its own headers keeps them: only the Server header is hidden.
check 18085 / 200 Permissions-Policy -- Strict-Transport-Security X-Frame-Options
own=$(curl --silent --include --max-time 5 "http://127.0.0.1:18085/" | tr -d '\r' | tr 'A-Z' 'a-z')
grep -q '^permissions-policy: microphone=(self)$' <<<"$own" || fail "own headers: Permissions-Policy was changed"

if ((failures > 0)); then
  echo "$failures problem(s)." >&2
  exit 1
fi
echo "  ok"
