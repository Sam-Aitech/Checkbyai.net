#!/bin/bash
# Download csvdiff directly
cd /home/runner/workspace/bin
echo "Downloading csvdiff..."
curl -fsSL "https://github.com/aswinkarthik/csvdiff/releases/download/v0.4.5/csvdiff-linux_amd64.tar.gz" -o csvdiff.tar.gz
tar xzf csvdiff.tar.gz
rm csvdiff.tar.gz
chmod +x csvdiff

# For qsv, we can use simpler approach or skip if csvdiff is main requirement
echo "Binaries ready"
