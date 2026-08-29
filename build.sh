#!/usr/bin/env bash
set -e

# Build static site and server bundle
echo "Building static site and server..."
npx vite build
npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs

