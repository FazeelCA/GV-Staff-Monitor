import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

// S3 imports (used when credentials are configured)
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import sharp from "sharp";

const hasS3Config =
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.S3_BUCKET_NAME;

const s3Client = hasS3Config
  ? new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })
  : null;

export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  mimetype: string
): Promise<string> {
  let processedBuffer = buffer;
  let ext = path.extname(originalName) || ".png";
  let processedMimetype = mimetype;

  // Compress and convert to WebP
  try {
    processedBuffer = await sharp(buffer)
      .webp({ quality: 60, effort: 4 })
      .toBuffer();
    ext = ".webp";
    processedMimetype = "image/webp";
  } catch (error) {
    console.error("Image compression failed, falling back to original:", error);
  }

  const filename = `screenshots/${uuidv4()}${ext}`;

  // Use S3 if credentials are available
  if (s3Client && hasS3Config) {
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.S3_BUCKET_NAME!,
        Key: filename,
        Body: processedBuffer,
        ContentType: processedMimetype,
      },
    });
    const result = await upload.done();
    return (result as any).Location as string;
  }

  // Fallback: save to local disk or mounted storage
  const baseUploadsDir = process.env.STORAGE_PATH || path.join(__dirname, "../../uploads");
  const screenshotsDir = process.env.STORAGE_PATH ? baseUploadsDir : path.join(baseUploadsDir, "screenshots");

  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const localFilename = `${uuidv4()}${ext}`;
  const localPath = path.join(screenshotsDir, localFilename);
  fs.writeFileSync(localPath, processedBuffer);

  // Return a URL that the static file server will serve
  return `/uploads/screenshots/${localFilename}`;
}

export async function deleteFile(imageUrl: string): Promise<void> {
  // 1. Handle S3 deletion
  if (s3Client && hasS3Config && imageUrl.startsWith("http")) {
    try {
      const url = new URL(imageUrl);
      const bucketName = process.env.S3_BUCKET_NAME!;
      // Assume the key is everything after the bucket name or the first part of the path
      // More reliably, if it's standard S3 URL: https://bucket.s3.region.amazonaws.com/key
      const key = url.pathname.startsWith("/") ? url.pathname.slice(1) : url.pathname;

      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await s3Client.send(new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      }));
      console.log(`Deleted from S3: ${key}`);
    } catch (error) {
      console.error("S3 deletion failed:", error);
    }
    return;
  }

  // 2. Handle local deletion
  if (imageUrl.startsWith("/uploads/")) {
    try {
      const filename = path.basename(imageUrl);
      const baseUploadsDir = process.env.STORAGE_PATH || path.join(__dirname, "../../uploads");
      const screenshotsDir = process.env.STORAGE_PATH ? baseUploadsDir : path.join(baseUploadsDir, "screenshots");
      const localPath = path.join(screenshotsDir, filename);

      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
        console.log(`Deleted local file: ${localPath}`);
      }
    } catch (error) {
      console.error("Local file deletion failed:", error);
    }
  }
}
