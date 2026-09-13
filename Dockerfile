FROM oven/bun:1-alpine

WORKDIR /app

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "if [ -f package.json ]; then bun install && bun run dev; else echo 'Backend pendiente de implementación'; exec tail -f /dev/null; fi"]
