FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY apps/analytics/package.json apps/analytics/package-lock.json ./apps/analytics/
RUN npm --prefix apps/analytics ci
COPY . .
RUN npm test && npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production MASAFLOW_HOST=0.0.0.0 PORT=4173 MASAFLOW_DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/server.js /app/package.json ./
COPY --from=build /app/assets ./assets
COPY --from=build /app/shared ./shared
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/apps/html ./apps/html
COPY --from=build /app/apps/analytics/dist ./apps/analytics/dist
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
