#!/usr/bin/env bash
# ============================================================
# setup-binaries.sh
#
# Downloads and installs the two high-performance pipeline binaries:
#   1. qsv  (Rust)  — CSV validation, dedup, count
#   2. csvdiff (Go) — Fast CSV diff engine
#
# Both are placed in {PROJECT_ROOT}/bin/ and are gitignored.
# Re-running this script is safe — it skips already-installed binaries.
#
# Usage:
#   bash scripts/setup-binaries.sh
#   npm run setup:binaries
# ============================================================

set -euo pipefail

# ── Detect platform ───────────────────────────────────────────────────────────
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Map to binary naming conventions
case "$ARCH" in
  x86_64)
    QSV_ARCH="x86_64-unknown-linux-gnu"
    CSVDIFF_ARCH="linux_amd64"
    ;;
  aarch64 | arm64)
    QSV_ARCH="aarch64-unknown-linux-gnu"
    CSVDIFF_ARCH="linux_arm64"
    ;;
  *)
    echo "[setup] Unsupported architecture: $ARCH"
    echo "[setup] Please install qsv and csvdiff manually into bin/"
    exit 1
    ;;
esac

# ── Directories ───────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$PROJECT_ROOT/bin"
DATA_DIR="$PROJECT_ROOT/data/archives"

mkdir -p "$BIN_DIR"
mkdir -p "$DATA_DIR"

echo "[setup] Installing pipeline binaries to: $BIN_DIR"
echo "[setup] CSV archive directory:           $DATA_DIR"
echo ""

# ── Helpers ───────────────────────────────────────────────────────────────────
fetch_latest_tag() {
  local repo="$1"
  curl -sSf "https://api.github.com/repos/${repo}/releases/latest" \
    | grep '"tag_name"' \
    | sed 's/.*"tag_name": "\(.*\)".*/\1/'
}

require_tool() {
  if ! command -v "$1" &>/dev/null; then
    echo "[setup] ERROR: '$1' is required but not installed."
    exit 1
  fi
}

require_tool curl
require_tool unzip || true   # only needed for qsv

# ── Install qsv (Rust CSV toolkit) ───────────────────────────────────────────
install_qsv() {
  if [[ -x "$BIN_DIR/qsv" ]]; then
    echo "[setup] qsv already installed:"
    "$BIN_DIR/qsv" --version
    return 0
  fi

  echo "[setup] Fetching latest qsv release tag..."
  QSV_VERSION=$(fetch_latest_tag "dathere/qsv")
  echo "[setup] Installing qsv ${QSV_VERSION} (${QSV_ARCH})..."

  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT

  # qsv ships as a zip file
  DOWNLOAD_URL="https://github.com/dathere/qsv/releases/download/${QSV_VERSION}/qsv-${QSV_VERSION}-${QSV_ARCH}.zip"
  echo "[setup] Downloading: $DOWNLOAD_URL"

  curl -sSfL "$DOWNLOAD_URL" -o "$TMP/qsv.zip" || {
    # Fallback: try the "lite" variant (smaller, all features we need)
    LITE_URL="https://github.com/dathere/qsv/releases/download/${QSV_VERSION}/qsv_lite-${QSV_VERSION}-${QSV_ARCH}.zip"
    echo "[setup] Primary download failed, trying lite variant..."
    curl -sSfL "$LITE_URL" -o "$TMP/qsv.zip"
  }

  unzip -q "$TMP/qsv.zip" -d "$TMP/qsv_extracted"

  # The zip may contain 'qsv', 'qsv_lite', or 'qsvlite'
  QSV_BINARY=""
  for candidate in qsv qsv_lite qsvlite; do
    if [[ -f "$TMP/qsv_extracted/$candidate" ]]; then
      QSV_BINARY="$TMP/qsv_extracted/$candidate"
      break
    fi
  done

  if [[ -z "$QSV_BINARY" ]]; then
    echo "[setup] ERROR: Could not find qsv binary in downloaded zip."
    echo "[setup] Contents:"
    ls -la "$TMP/qsv_extracted/"
    exit 1
  fi

  cp "$QSV_BINARY" "$BIN_DIR/qsv"
  chmod +x "$BIN_DIR/qsv"
  trap - EXIT
  rm -rf "$TMP"

  echo "[setup] qsv installed: $("$BIN_DIR/qsv" --version)"
}

# ── Install csvdiff (Go CSV diff engine) ─────────────────────────────────────
install_csvdiff() {
  if [[ -x "$BIN_DIR/csvdiff" ]]; then
    echo "[setup] csvdiff already installed:"
    "$BIN_DIR/csvdiff" --version 2>&1 || true
    return 0
  fi

  echo "[setup] Fetching latest csvdiff release tag..."
  CSVDIFF_TAG=$(fetch_latest_tag "aswinkarthik/csvdiff")
  CSVDIFF_VERSION="${CSVDIFF_TAG#v}"  # strip leading 'v'
  echo "[setup] Installing csvdiff v${CSVDIFF_VERSION} (${CSVDIFF_ARCH})..."

  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT

  DOWNLOAD_URL="https://github.com/aswinkarthik/csvdiff/releases/download/${CSVDIFF_TAG}/csvdiff_${CSVDIFF_VERSION}_${CSVDIFF_ARCH}.tar.gz"
  echo "[setup] Downloading: $DOWNLOAD_URL"

  curl -sSfL "$DOWNLOAD_URL" -o "$TMP/csvdiff.tar.gz"
  tar -xzf "$TMP/csvdiff.tar.gz" -C "$TMP"

  if [[ -f "$TMP/csvdiff" ]]; then
    cp "$TMP/csvdiff" "$BIN_DIR/csvdiff"
  else
    echo "[setup] ERROR: Could not find csvdiff binary in archive."
    echo "[setup] Contents:"
    ls -la "$TMP/"
    exit 1
  fi

  chmod +x "$BIN_DIR/csvdiff"
  trap - EXIT
  rm -rf "$TMP"

  echo "[setup] csvdiff installed: $("$BIN_DIR/csvdiff" --version 2>&1 || echo 'ok')"
}

# ── Run installations ─────────────────────────────────────────────────────────
install_qsv
echo ""
install_csvdiff

echo ""
echo "================================================"
echo "  Binary setup complete!"
echo "  qsv:      $BIN_DIR/qsv"
echo "  csvdiff:  $BIN_DIR/csvdiff"
echo "  archives: $DATA_DIR"
echo ""
echo "  Verify with: npm run check:binaries"
echo "================================================"
