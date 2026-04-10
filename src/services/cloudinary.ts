// src/services/cloudinary.ts
import { v2 as cloudinary } from "cloudinary";
import dns from "node:dns";
import https from "node:https";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
  timeout: 120000,
});

const RETRYABLE_ERROR_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// In some environments Node resolves Cloudinary to unreachable IPv6 paths.
// Force IPv4 for Cloudinary upload requests.
const cloudinaryIpv4Agent = new https.Agent({
  keepAlive: true,
  lookup: (hostname: string, options: any, callback: any) => {
    const wantsAll = Boolean(options && typeof options === "object" && options.all);
    dns.lookup(hostname, { family: 4, all: wantsAll }, callback);
  },
});

const getUploadErrorDetails = (error: any) => {
  const code = error?.error?.code || error?.code;
  const message =
    error?.error?.message ||
    error?.message ||
    (code ? `Cloudinary upload failed with code ${code}` : "Cloudinary upload failed");

  return { code, message };
};

export const uploadToCloudinary = async (
  filePath: string,
  resourceType: "video" | "auto" = "auto",
  folder: string = "clip-generator/originals",
) => {
  console.log(`☁️ Uploading to Cloudinary: ${filePath} | Type: ${resourceType}`);

  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await cloudinary.uploader.upload(filePath, {
        folder,
        resource_type: resourceType,
        timeout: 120000,
        chunk_size: 6000000,
        use_filename: true,
        unique_filename: true,
        agent: cloudinaryIpv4Agent,
      });

      console.log(`✅ Cloudinary upload successful: ${result.public_id}`);
      return {
        publicId: result.public_id,
        url: result.secure_url,
        duration: result.duration || 0,
        format: result.format,
        resourceType: result.resource_type,
      };
    } catch (error: any) {
      const { code, message } = getUploadErrorDetails(error);
      const retryable = code ? RETRYABLE_ERROR_CODES.has(code) : false;

      console.error(
        `❌ Cloudinary Upload Failed (attempt ${attempt}/${maxAttempts}) | code=${code ?? "unknown"} | message=${message}`,
      );

      if (retryable && attempt < maxAttempts) {
        await sleep(attempt * 1500);
        continue;
      }

      throw new Error(message);
    }
  }

  throw new Error("Cloudinary upload failed after retries");
};
