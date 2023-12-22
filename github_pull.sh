#! /usr/bin/bash

cd /var/www/EnergyMonitor
git pull origin main --ff-only

cd /web
pnpm i
npx vite build

cd ../backend
pnpm i
npx tsc
