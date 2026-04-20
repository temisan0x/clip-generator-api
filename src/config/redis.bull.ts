import { Redis } from "ioredis";

let connection: Redis | null = null;

const getBullRedis = (): Redis => {
  if (!connection) {
    const redisUrl = process.env.UPSTASH_REDIS_URL;
    if (!redisUrl) throw new Error("Missing Redis URL");

    connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy(times) {
        if (times > 8) return null;
        return Math.min(times * 500, 3000);
      },
    });

    connection.on("error", (err) => {
      if (!err?.message) return;
      console.error("❌ Bull Redis error:", err.message);
    });

    setInterval(() => {
      connection!.ping().catch(() => {});
    }, 4 * 60 * 1000);
  }

  return connection;
};

export default getBullRedis;