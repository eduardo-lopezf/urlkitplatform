# syntax=docker/dockerfile:1
# Multi-stage build. The API runs TypeScript directly with Node's native type stripping, so the
# image carries @urlkit/api and its workspace packages; dev dependencies are kept because the
# rules catalog is compiled (and validated with ajv) during the build.
FROM node:24-alpine AS deps
WORKDIR /repo
RUN npm install -g pnpm@10
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --filter @urlkit/api... \
 && pnpm --filter @urlkit/rules build

FROM node:24-alpine
ENV NODE_ENV=production PORT=8787
WORKDIR /repo
COPY --from=deps --chown=node:node /repo /repo
USER node
EXPOSE 8787
CMD ["node", "apps/api/src/server.ts"]
