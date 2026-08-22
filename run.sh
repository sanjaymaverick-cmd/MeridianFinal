#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null; then
  echo "Install Node.js 22 LTS from https://nodejs.org"
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

if [[ ! -d node_modules ]]; then
  echo "Installing npm packages..."
  npm install
fi

echo
echo "Meridian Final — http://localhost:3000"
echo "Login ID WQ3137   Password Test@password"
echo "Leave this terminal open for overnight paper."
echo

exec npm run dev:local
