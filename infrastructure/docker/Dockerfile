FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps/admin/package.json apps/admin/package.json
COPY services/api/package.json services/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api-contract/package.json packages/api-contract/package.json
RUN npm ci
COPY . .
RUN npm --workspace @rewzio/shared run build && npm --workspace @rewzio/api-contract run build && npm --workspace @rewzio/api run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/api ./services/api
COPY --from=build /app/packages ./packages
USER node
EXPOSE 3001
CMD ["node", "services/api/dist/server.js"]
