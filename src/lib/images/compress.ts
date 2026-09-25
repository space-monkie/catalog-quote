// Browser-side image resizing before upload: a ~1600px "full" image and a ~400px thumbnail.
// PNG sources keep PNG (transparency, logos); everything else becomes JPEG.

export type PreparedImage = {
  full: Blob;
  thumb: Blob;
  ext: "jpg" | "png";
  contentType: "image/jpeg" | "image/png";
};

export type PrepareOptions = { fullSize?: number; thumbSize?: number; quality?: number };

type Source = ImageBitmap | HTMLImageElement;

async function loadSource(file: File): Promise<Source> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // fall through to <img>
    }
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

function dimensions(source: Source): { width: number; height: number } {
  if ("naturalWidth" in source) return { width: source.naturalWidth, height: source.naturalHeight };
  return { width: source.width, height: source.height };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))), type, quality);
  });
}

async function resize(source: Source, maxSize: number, type: string, quality: number): Promise<Blob> {
  const { width, height } = dimensions(source);
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  if (type === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(source, 0, 0, w, h);
  return toBlob(canvas, type, quality);
}

export async function prepareImage(file: File, options: PrepareOptions = {}): Promise<PreparedImage> {
  const fullSize = options.fullSize ?? 1600;
  const thumbSize = options.thumbSize ?? 400;
  const quality = options.quality ?? 0.82;
  const keepPng = file.type === "image/png";
  const contentType = keepPng ? "image/png" : "image/jpeg";
  const source = await loadSource(file);
  try {
    const [full, thumb] = await Promise.all([
      resize(source, fullSize, contentType, quality),
      resize(source, thumbSize, contentType, quality),
    ]);
    return { full, thumb, ext: keepPng ? "png" : "jpg", contentType };
  } finally {
    if ("close" in source) source.close();
  }
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}
