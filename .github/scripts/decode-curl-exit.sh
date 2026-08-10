#!/usr/bin/env bash
#
# Decode a curl exit code into a human-readable cause, then fail the caller.
#
# Usage: decode-curl-exit.sh <curl_exit_code> [context_label]
#   e.g. decode-curl-exit.sh 6 "Health check"
#
# Exits 0 when the curl exit code is 0 (nothing to report), so callers can
# invoke it unconditionally. On any non-zero curl exit it prints the decoded
# cause and exits 1, which fails the calling workflow step under `set -e`.
#
# Kept as a standalone script (rather than inline YAML) so both curl call sites
# in sponsor-monitor-cron.yml share one copy, and so the decode table can be
# exercised outside a GitHub Actions runner.

set -uo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: decode-curl-exit.sh <curl_exit_code> [context_label]" >&2
  exit 2
fi

CURL_EXIT="$1"
CONTEXT="${2:-Request}"

case "$CURL_EXIT" in
  ''|*[!0-9]*)
    echo "❌ decode-curl-exit.sh: expected a numeric curl exit code, got: $CURL_EXIT" >&2
    exit 2
    ;;
esac

if [ "$CURL_EXIT" -eq 0 ]; then
  exit 0
fi

echo "❌ ${CONTEXT} transport failure (curl exit code ${CURL_EXIT})."
case "$CURL_EXIT" in
  6)  echo "   Meaning: could not resolve host." ;;
  7)  echo "   Meaning: could not connect to host (connection refused)." ;;
  28) echo "   Meaning: request timed out." ;;
  35) echo "   Meaning: TLS/SSL handshake failed." ;;
  52) echo "   Meaning: server returned an empty reply." ;;
  56) echo "   Meaning: failure receiving network data." ;;
  *)  echo "   See https://curl.se/libcurl/c/libcurl-errors.html for exit code ${CURL_EXIT}." ;;
esac

exit 1
