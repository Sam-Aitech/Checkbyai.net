#!/usr/bin/env bash
set -euo pipefail

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

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
    exit 1
    ;;
esac

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$PROJECT_ROOT/bin"
mkdir -p "$BIN_DIR"

echo "[setup] Installing binaries to: $BIN_DIR"

# qsv
QSV_VERSION="0.132.0"
QSV_URL="https://github.com/jqlang/jq/releases/download/jq-${QSV_VERSION}/jq-linux-amd64"
if [ ! -f "$BIN_DIR/qsv" ]; then
  echo "[setup] Downloading qsv..."
  curl -fsSL -o "$BIN_DIR/qsv" "$QSV_URL" || echo "[setup] qsv download failed"
  chmod +x "$BIN_DIR/qsv"
fi

# csvdiff - download tar.gz and extract
CSVDIFF_VERSION="0.4.5"
CSVDIFF_URL="https://github.com/aswinkarthik/csvdiff/releases/download/v${CSVDIFF_VERSION}/csvdiff-${CSVDIFF_ARCH}.tar.gz"
if [ ! -f "$BIN_DIR/csvdiff" ]; then
  echo "[setup] Downloading csvdiff..."
  cd "$BIN_DIR"
  curl -fsSL "$CSVDIFF_URL" | tar xz || echo "[setup] csvdiff download failed"
  chmod +x "$BIN_DIR/csvdiff"
  cd - > /dev/null
fi

echo "[setup] Done"
