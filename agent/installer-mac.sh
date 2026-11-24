#!/bin/bash
# Installe FS Impression sur Mac : demarre tout seul a l'ouverture de session.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "Installation de FS Impression (Mac)..."
export PATH="$HOME/.bun/bin:$PATH"
if ! command -v bun >/dev/null 2>&1; then
  echo "Installation de Bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi
cd "$DIR" && bun install >/dev/null
PL="$HOME/Library/LaunchAgents/fr.turnshop.fsimpression.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PL" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>fr.turnshop.fsimpression</string>
<key>ProgramArguments</key><array><string>$HOME/.bun/bin/bun</string><string>$DIR/agent/agent.ts</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>/tmp/fsimpression.log</string><key>StandardErrorPath</key><string>/tmp/fsimpression.log</string>
</dict></plist>
EOF
launchctl unload "$PL" >/dev/null 2>&1 || true
launchctl load "$PL"
sleep 2
echo "Test :"; curl -s http://127.0.0.1:9101/ping || echo "(le programme ne repond pas, voir /tmp/fsimpression.log)"
echo
echo "C'est installe. Retourne sur FS by TURN Shop (dans Chrome) et imprime un ticket."
