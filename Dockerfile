# ---------- Base ----------
FROM node:20-slim AS base
WORKDIR /app

# ---------- Dependencies Layer ----------
FROM base AS deps
COPY package*.json ./
RUN npm ci

# ---------- Builder ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- Production ----------
FROM node:20-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    python3 \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*
    
# Copy built app only
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./

RUN mkdir -p uploads temp/clips

EXPOSE 3000

CMD ["node", "dist/server.js"]