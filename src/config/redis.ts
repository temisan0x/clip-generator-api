// src/config/redis.ts
import Redis from "ioredis";

let redisClient: Redis | null = null;

const maskRedisUrl = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl);
    const user = parsed.username || "user";
    const host = parsed.hostname;
    const port = parsed.port || "6379";
    return `${parsed.protocol}//${user}:***@${host}:${port}`;
  } catch {
    return "[invalid-url]";
  }
};

const getRedisClient = () => {
  if (redisClient) return redisClient;

  const rawUrl = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL;

  if (!rawUrl) {
    throw new Error(
      "❌ Missing Redis URL. Set UPSTASH_REDIS_URL (or REDIS_URL) to a rediss:// URL from Upstash."
    );
  }

  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    throw new Error(
      "❌ Invalid Redis URL scheme. BullMQ/ioredis needs rediss://...:6379, not https:// (REST endpoint)."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("❌ Invalid Redis URL format in .env");
  }

  if (!["redis:", "rediss:"].includes(parsed.protocol)) {
    throw new Error("❌ Redis URL must start with redis:// or rediss://");
  }

  if (parsed.username === "default_ro") {
    throw new Error(
      "❌ Read-only Redis user (default_ro) cannot be used by BullMQ workers. Use write-enabled user (usually default)."
    );
  }

  console.log("🔗 Connecting to Redis with URL:", maskRedisUrl(rawUrl));

  redisClient = new Redis(rawUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    reconnectOnError: () => true,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
  });

  return redisClient;
};

export default getRedisClient;
