FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/client-web/package.json ./apps/client-web/
COPY apps/business-pos/package.json ./apps/business-pos/
COPY apps/analytics/package.json ./apps/analytics/
RUN npm ci
COPY . .
RUN npm test && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production MASAFLOW_HOST=0.0.0.0 PORT=4173 MASAFLOW_DATA_DIR=/data/realtime MASAFLOW_LOG_DIR=/data/logs
WORKDIR /app
COPY --from=build /app/server.js /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared/realtime ./shared/realtime
COPY --from=build /app/shared/logger.js ./shared/logger.js
COPY --from=build /app/shared/qrcode.js ./shared/qrcode.js
COPY --from=build /app/shared/ui/choice-groups.js ./shared/ui/choice-groups.js
COPY --from=build /app/shared/types/realtime.ts ./shared/types/realtime.ts
COPY --from=build /app/assets/apple-touch-icon.png /app/assets/icon.svg /app/assets/manifest.webmanifest /app/assets/sw.js /app/assets/pwa-192x192.png /app/assets/pwa-512x512.png /app/assets/pwa-maskable-512x512.png ./assets/
COPY --from=build /app/apps/client-web/dist-realtime ./apps/client-web/dist-realtime
COPY --from=build /app/apps/business-pos/dist-realtime ./apps/business-pos/dist-realtime
COPY --from=build /app/apps/analytics/dist-realtime ./apps/analytics/dist-realtime
RUN mkdir -p /data/realtime /data/logs && chown -R node:node /data
USER node
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
