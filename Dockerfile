FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile=false
COPY . .

FROM base AS build
ARG DATABASE_URL=postgresql://virtual_nation:virtual_nation_dev@postgres:5432/virtual_nation
ARG BETTER_AUTH_SECRET=build-only-secret-that-is-long-enough
ARG APP_BASE_URL=http://localhost:3000
ENV DATABASE_URL=$DATABASE_URL BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET APP_BASE_URL=$APP_BASE_URL
RUN pnpm build

FROM base AS worker
ENV NODE_ENV=production
CMD ["pnpm", "worker"]

FROM node:24-alpine AS runner
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
