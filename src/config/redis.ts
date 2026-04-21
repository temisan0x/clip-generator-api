import Redis from "ioredis";

let redisClient: Redis | null = null;

const getRedisUrl = (): string => {
  const url =
    process.env.UPSTASH_REDIS_URL?.trim() ||
    process.env.REDIS_URL?.trim();

  if (!url) {
    throw new Error("Redis URL is missing (UPSTASH_REDIS_URL or REDIS_URL)");
  }

  return url;
};

const getRedisClient = (): Redis => {
  if (redisClient) return redisClient;

  const rawUrl = getRedisUrl();

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid Redis URL format");
  }

  const isTLS = parsed.protocol === "rediss:";

  console.log("🔌 Creating Redis client...");

  redisClient = new Redis(rawUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,

    connectTimeout: 15000,
    keepAlive: 30000, 

    family: 4,

    retryStrategy: (times) => {
      if (times > 10) {
        console.error("❌ Redis max retry limit reached");
        return null; // stop reconnect loop
      }
      return Math.min(times * 500, 3000);
    },

    tls: isTLS ? {} : undefined,
  });

  // REAL visibility only
  redisClient.on("connect", () => {
    console.log("🟡 Redis connecting...");
  });

  redisClient.on("ready", () => {
    console.log("🟢 Redis ready");
  });

  redisClient.on("error", (err) => {
    console.error("🔴 Redis error:", err.message);
  });

  redisClient.on("close", () => {
    console.warn("🟠 Redis connection closed");
  });

  return redisClient;
};

export default getRedisClient;