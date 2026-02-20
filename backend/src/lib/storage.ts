import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

// S3 imports (used when credentials are configured)
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

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
  const ext = path.extname(originalName) || ".png";
  const filename = `screenshots/${uuidv4()}${ext}`;

  // Use S3 if credentials are available
  if (s3Client && hasS3Config) {
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.S3_BUCKET_NAME!,
        Key: filename,
        Body: buffer,
        ContentType: mimetype,
      },
    });
    const result = await upload.done();
    return (result as any).Location as string;
  }

  // Fallback: save to local disk
  const uploadsDir = path.join(__dirname, "../../uploads/screenshots");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const localFilename = `${uuidv4()}${ext}`;
  const localPath = path.join(uploadsDir, localFilename);
  fs.writeFileSync(localPath, buffer);
  // Return a URL that the static file server will serve
  return `/uploads/screenshots/${localFilename}`;
}
