import { Queue } from "bullmq";
import bullRedis from "../config/redis.bull";
import type { ClipJobData } from "../types/clipJob";

let queue: Queue<ClipJobData> | null = null;

const getClipQueue = (): Queue<ClipJobData> => {
  if (!queue) {
    queue = new Queue<ClipJobData>("clip-processing", {
      connection: bullRedis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: { age: 7200 },
        removeOnFail: { age: 86400 },
      },
    });
  }

  return queue;
};

export default getClipQueue;