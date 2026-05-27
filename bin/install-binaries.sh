#!/bin/bash
set -e

echo "[install] Installing binaries..."

# csvdiff - check if already exists
if [ ! -f bin/csvdiff ]; then
  echo "[install] Downloading csvdiff v0.4.5..."
  cd bin
  curl -fsSL "https://github.com/aswinkarthik/csvdiff/releases/download/v0.4.5/csvdiff-v0.4.5-linux_amd64.tar.gz" -o temp.tar.gz 2>/dev/null || \
  curl -fsSL "https://github.com/aswinkarthik/csvdiff/releases/download/v0.4.5/csvdiff-linux_amd64.tar.gz" -o temp.tar.gz || \
  curl -fsSL "https://github.com/aswinkarthik/csvdiff/releases/download/v0.4.5/csvdiff_linux_amd64.tar.gz" -o temp.tar.gz 2>/dev/null || \
  echo "[install] csvdiff download skipped (optional)"
  
  if [ -f temp.tar.gz ]; then
    tar xzf temp.tar.gz && rm temp.tar.gz && chmod +x csvdiff
    echo "[install] csvdiff installed"
  fi
  cd ..
fi

echo "[install] Done"
