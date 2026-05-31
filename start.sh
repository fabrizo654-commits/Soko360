#!/usr/bin/env bash
# ── Mama Mboga Quick Start ─────────────────────────────────
set -e

# 1. Check .env exists
if [ ! -f .env ]; then
  echo "⚠️  No .env file found."
  echo "   Run: cp .env.example .env"
  echo "   Then fill in your Daraja credentials."
  exit 1
fi

# 2. Check for unfilled placeholders
if grep -q "PASTE_YOUR\|XXXXXXXXX\|YOUR_NGROK" .env; then
  echo "⚠️  Your .env still has placeholder values."
  echo "   Open .env and replace all lines containing PASTE_YOUR / XXXXXXXXX / YOUR_NGROK."
  exit 1
fi

# 3. Install dependencies if needed
if [ ! -d node_modules ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# 4. Start server
echo "🥦 Starting Mama Mboga..."
npm run dev
