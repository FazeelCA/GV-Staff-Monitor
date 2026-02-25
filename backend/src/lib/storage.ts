import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

// Primary: Hetzner Storage Box mounted at /mnt/screenshots
// Fallback: local dist/uploads/screenshots
const STORAGE_PRIMARY = "/mnt/screenshots";
const STORAGE_FALLBACK = path.join(__dirname, "../../uploads/screenshots");

function getStorageDir(): string {
  if (fs.existsSync(STORAGE_PRIMARY)) {
    return STORAGE_PRIMARY;
  }
  if (!fs.existsSync(STORAGE_FALLBACK)) {
    try { fs.mkdirSync(STORAGE_FALLBACK, { recursive: true }); } catch (e) { }
  }
  return STORAGE_FALLBACK;
}

export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  _mimetype: string
): Promise<string> {
  const ext = path.extname(originalName) || ".jpg";
  const storageDir = getStorageDir();
  const filename = `${uuidv4()}${ext}`;
  const filePath = path.join(storageDir, filename);

  fs.writeFileSync(filePath, buffer);
  console.log(`[STORAGE] Saved ${buffer.length} bytes -> ${filePath}`);

  const appUrl = (process.env.APP_URL || "https://track.gallerydigital.in").replace(/\/$/, "");
  return `${appUrl}/uploads/screenshots/${filename}`;
}

export async function deleteFile(imageUrl: string): Promise<void> {
  try {
    const filename = path.basename(imageUrl);
    for (const dir of [STORAGE_PRIMARY, STORAGE_FALLBACK]) {
      const filePath = path.join(dir, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[STORAGE] Deleted ${filePath}`);
        return;
      }
    }
  } catch (e) {
    console.error("[STORAGE] Delete failed:", e);
  }
}
