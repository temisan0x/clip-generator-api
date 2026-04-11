import { Queue } from "bullmq";
import getRedisClient from "../config/redis";

export interface ClipJobData {
  jobId: string;
  tempFilePath: string;
  mimeType: string;
  prompt: string;
  ratio: string;
  cleanupDir?: string;
}

let queue: Queue | null = null;

const getClipQueue = (): Queue => {
  if (!queue) {
    queue = new Queue("clip-processing", {
      connection: getRedisClient(),
    });
  }
  return queue;
};

export default getClipQueue;
