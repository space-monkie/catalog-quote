import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { firebaseClient } from "./client";
import { prepareImage } from "@/lib/images/compress";
import { randomId } from "@/lib/ids";
import type { ImageAsset } from "@/lib/schemas/types";

// Storage paths (all under stores/{storeId}/ so the rules can check ownership):
//   stores/{storeId}/logo/{id}.jpg
//   stores/{storeId}/categories/{categoryId}/{id}.jpg
//   stores/{storeId}/items/{itemId}/{id}.jpg  (+ {id}_thumb.jpg)

export const imagePaths = {
  logo: (storeId: string) => `stores/${storeId}/logo`,
  category: (storeId: string, categoryId: string) => `stores/${storeId}/categories/${categoryId}`,
  item: (storeId: string, itemId: string) => `stores/${storeId}/items/${itemId}`,
};

/** Compresses in the browser (≈1600px full + ≈400px thumb) and uploads both. */
export async function uploadImageAsset(basePath: string, file: File): Promise<ImageAsset> {
  const { storage } = firebaseClient();
  const prepared = await prepareImage(file);
  const id = randomId(12);
  const path = `${basePath}/${id}.${prepared.ext}`;
  const thumbPath = `${basePath}/${id}_thumb.${prepared.ext}`;
  const fullRef = ref(storage, path);
  const thumbRef = ref(storage, thumbPath);
  const meta = { contentType: prepared.contentType, cacheControl: "public, max-age=31536000, immutable" };
  await Promise.all([uploadBytes(fullRef, prepared.full, meta), uploadBytes(thumbRef, prepared.thumb, meta)]);
  const [url, thumbUrl] = await Promise.all([getDownloadURL(fullRef), getDownloadURL(thumbRef)]);
  return { path, thumbPath, url, thumbUrl };
}

/** Deletes both files; missing files are ignored. */
export async function deleteImageAsset(asset: ImageAsset | null | undefined): Promise<void> {
  if (!asset) return;
  const { storage } = firebaseClient();
  const paths = [asset.path, asset.thumbPath].filter(Boolean);
  await Promise.all(
    paths.map(async (p) => {
      try {
        await deleteObject(ref(storage, p));
      } catch (err) {
        if ((err as { code?: string })?.code !== "storage/object-not-found") throw err;
      }
    }),
  );
}

export async function deleteImageAssets(assets: (ImageAsset | null | undefined)[]): Promise<void> {
  await Promise.all(assets.map((a) => deleteImageAsset(a)));
}

/** Copies an asset to a new base path (used when duplicating items). */
export async function copyImageAsset(asset: ImageAsset, basePath: string): Promise<ImageAsset> {
  const { storage } = firebaseClient();
  const ext = asset.path.split(".").pop() || "jpg";
  const id = randomId(12);
  const path = `${basePath}/${id}.${ext}`;
  const thumbPath = `${basePath}/${id}_thumb.${ext}`;
  const download = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not download ${url} (${res.status})`);
    return res.blob();
  };
  const [full, thumb] = await Promise.all([download(asset.url), download(asset.thumbUrl)]);
  const meta = { contentType: full.type || "image/jpeg", cacheControl: "public, max-age=31536000, immutable" };
  const fullRef = ref(storage, path);
  const thumbRef = ref(storage, thumbPath);
  await Promise.all([uploadBytes(fullRef, full, meta), uploadBytes(thumbRef, thumb, meta)]);
  const [url, thumbUrl] = await Promise.all([getDownloadURL(fullRef), getDownloadURL(thumbRef)]);
  return { path, thumbPath, url, thumbUrl };
}
