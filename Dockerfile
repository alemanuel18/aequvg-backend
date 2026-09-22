FROM oven/bun:1-alpine

WORKDIR /app

ENV NODE_ENV=development \
    HOST=0.0.0.0 \
    PORT=3000

COPY . .

EXPOSE 3000

# El contenedor también puede levantarse durante la fase de estructura inicial.
# Cuando aparezca package.json, instala las dependencias y arranca el servidor.
CMD ["sh", "-c", "until [ -f package.json ]; do echo 'Esperando la inicialización del backend...'; sleep 2; done; if [ -f bun.lock ] || [ -f bun.lockb ]; then bun install --frozen-lockfile; else bun install; fi; exec bun run dev"]
