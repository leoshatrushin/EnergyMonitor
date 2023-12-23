#! /usr/bin/bash

cd /var/www/EnergyMonitor
git pull origin main --ff-only

cd web
pnpm i
npm run prod

cd ../backend
pnpm i
npm run prod
