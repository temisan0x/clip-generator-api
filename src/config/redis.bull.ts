import { Redis } from "ioredis";

const redisUrl = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error("Missing Redis URL");
}

const connection = new Redis(redisUrl, {
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
  connection.ping().catch(() => {});
}, 4 * 60 * 1000);

export default connection;
