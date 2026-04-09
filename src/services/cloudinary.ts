import cloudinary from "../config/cloudinary";
import fs from "fs";

interface CloudinaryUploadResult {
  publicId: string;
  url: string;
  duration?: number;
  format: string;
  resourceType: string;
}

export const uploadToCloudinary = async (
  filePath: string,
  resourceType: "video" | "auto" = "auto"
): Promise<CloudinaryUploadResult> => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: resourceType,
      folder: "clip-generator/originals",
    });

    // delete temp file after upload
    fs.unlinkSync(filePath);

    return {
      publicId: result.public_id,
      url: result.secure_url,
      duration: result.duration,
      format: result.format,
      resourceType: result.resource_type,
    };
  } catch (error) {
    // still clean up temp file even if cloudinary fails
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    throw error;
  }
};