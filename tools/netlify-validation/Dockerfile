FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git unzip \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@11.19.0
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig*.json prisma.config.ts eslint.config.mjs ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/validation/package.json ./packages/validation/package.json
COPY packages/pdf-engine/package.json ./packages/pdf-engine/package.json
RUN pnpm install --frozen-lockfile --prod=false
COPY apps ./apps
COPY packages ./packages
COPY prisma ./prisma
COPY docs ./docs
COPY netlify ./netlify
COPY netlify.toml ./
COPY tools/netlify-validation ./tools/netlify-validation
CMD ["node", "tools/netlify-validation/run-linux.mjs"]
