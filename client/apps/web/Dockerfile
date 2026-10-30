# Web image. Build context is the repository root:  docker build -f client/apps/web/Dockerfile .
FROM node:24-bookworm-slim AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY server/package.json server/package.json
COPY client/apps/web/package.json client/apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @office-template/web...

# The web app imports the API's public contracts and route types at build time.
COPY server/src server/src
COPY server/tsconfig.json server/tsconfig.json
COPY client/apps/web client/apps/web
RUN pnpm --filter @office-template/web build

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/client/apps/web/.output ./.output
ENV NODE_ENV=production \
    PORT=3000 \
    API_INTERNAL_URL=http://server:3001
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
