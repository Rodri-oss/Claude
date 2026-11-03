# Taiwan Mandarin Tutor: single container, SQLite on a persistent volume mounted at /data.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:/data/app.db
EXPOSE 3000
VOLUME ["/data"]

# Apply migrations and (idempotently) load the word list on every start, then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && npm start"]
