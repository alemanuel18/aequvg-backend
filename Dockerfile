FROM oven/bun:1-alpine AS dependencies

WORKDIR /app
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

FROM dependencies AS development

ENV NODE_ENV=development \
    HOST=0.0.0.0 \
    PORT=3000

COPY . .
EXPOSE 3000
CMD ["bun", "run", "dev"]

FROM dependencies AS tooling

ENV NODE_ENV=production
COPY . .

FROM oven/bun:1-alpine AS production-dependencies

WORKDIR /app
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile --production

FROM production-dependencies AS production

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY --chown=bun:bun src ./src
COPY --chown=bun:bun storage ./storage
USER bun
EXPOSE 3000
CMD ["bun", "run", "start"]
