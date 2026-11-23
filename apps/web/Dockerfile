# KodeCupid web app — Railway production image
#
# Build from the repository root with apps/web/Dockerfile.

FROM node:24-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @kodecupid/shared build \
  && pnpm --filter web build

ENV NODE_ENV=production
WORKDIR /app/apps/web

EXPOSE 3000

CMD ["pnpm", "start"]
