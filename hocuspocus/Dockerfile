# ============================================================
# Corgly — Hocuspocus Dockerfile (WebSocket Collaboration)
# Node 20 + tsx ESM loader + Prisma client
# ============================================================

FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser

# Install all deps (tsx is a devDependency needed at runtime)
COPY package.json package-lock.json ./
# npm install: package-lock.json desatualizado; --legacy-peer-deps: tiptap v2 cursor vs v3 core
RUN npm install --legacy-peer-deps

# Generate Prisma client
COPY prisma ./prisma
RUN npx prisma generate

# Copy only what the hocuspocus server needs
COPY hocuspocus ./hocuspocus
COPY src/types ./src/types
COPY tsconfig.json ./

USER appuser

EXPOSE 1234
ENV PORT=1234
ENV NODE_ENV=production

CMD ["node", "--import", "tsx/esm", "hocuspocus/server.ts"]
