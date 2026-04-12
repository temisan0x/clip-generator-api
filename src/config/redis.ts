import Redis from "ioredis";

let redisClient: Redis | null = null;

const maskRedisUrl = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.protocol}//${parsed.username || "default"}:***@${parsed.hostname}:${parsed.port || "6379"}`;
  } catch {
    return "[invalid-url]";
  }
};

const getRedisClient = () => {
  if (redisClient) return redisClient;

  const rawUrl = process.env.UPSTASH_REDIS_URL?.trim() || process.env.REDIS_URL?.trim();

  if (!rawUrl) {
    throw new Error("❌ UPSTASH_REDIS_URL is missing in .env");
  }

  if (rawUrl.startsWith("http")) {
    throw new Error("❌ Wrong Redis URL format. Use rediss://... (not https://)");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("❌ Invalid Redis URL format");
  }

  if (parsed.username === "default_ro") {
    throw new Error("❌ Use write-enabled Redis user (default), not default_ro");
  }

  console.log("🔗 Connecting to Redis:", maskRedisUrl(rawUrl));

  redisClient = new Redis(rawUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 15000,
    keepAlive: 30000,
    family: 4,                    // Force IPv4 (very helpful in Nigeria)
    retryStrategy: (times) => Math.min(times * 300, 5000),
    reconnectOnError: (err) => {
      console.warn("Redis reconnecting due to:", err.message);
      return true;
    },
    tls: rawUrl.startsWith("rediss") ? {} : undefined,
  });

  return redisClient;
};

export default getRedisClient;