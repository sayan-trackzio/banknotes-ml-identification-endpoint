import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';

// Initialize S3 client with credentials from environment variables
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Uploads a file to S3 in the background. Supports both disk and memory storage from multer.
 * @param {Array} files - Array of multer file objects (can be buffer or disk file).
 * @returns {Promise<void>}
 */
export async function uploadToS3InBackground(files) {
  if (!Array.isArray(files)) return;

  await Promise.all(files.map(async (file) => {
    const Bucket = process.env.AWS_S3_BUCKET_NAME;
    const Key = file.s3Key;
    let Body;

    if (file.buffer) {
      // Memory storage
      Body = file.buffer;
    } else if (file.path) {
      // Disk storage
      Body = fs.createReadStream(file.path);
    } else {
      throw new Error('File object missing buffer or path');
    }

    const params = {
      Bucket,
      Key,
      Body,
      ContentType: file.mimetype,
    };

    try {
      await s3.send(new PutObjectCommand(params));
      console.log(`==> S3 upload successful for ${Key}`);
    } catch (err) {
      console.error(`==> S3 upload failed for ${Key}:`, err);
      throw err;
    }
  }));
}
