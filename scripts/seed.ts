/**
 * Seeds a demo store modeled on JR Rubber Industries into the Firebase emulators.
 *
 *   npm run emulators          # in one terminal
 *   npm run seed               # in another (add --reset to wipe and recreate the demo store)
 *
 * Refuses to run against a real project unless --production is passed.
 * Everything it creates is labelled as sample data.
 */
import fs from "node:fs";
import path from "node:path";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { QUOTE_COUNTER_START } from "../src/lib/quote-number";
import { slugify } from "../src/lib/slug";

const envFile = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const args = new Set(process.argv.slice(2));
const RESET = args.has("--reset");
const PRODUCTION = args.has("--production");
const usingEmulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
if (!usingEmulators && !PRODUCTION) {
  console.error("FIRESTORE_EMULATOR_HOST is not set. Start the emulators, or pass --production to seed a real project.");
  process.exit(1);
}

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-catalog-quote";
const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${projectId}.firebasestorage.app`;

if (usingEmulators) process.env.METADATA_SERVER_DETECTION ??= "none";
if (!getApps().length) {
  initializeApp(usingEmulators ? { projectId, storageBucket: bucketName } : { credential: applicationDefault(), projectId, storageBucket: bucketName });
}
const db = getFirestore();
const auth = getAuth();
const bucket = getStorage().bucket(bucketName);

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo1234";
const STORE_SLUG = "jr-demo";
const BRAND = "#1d4ed8";

// ---------- placeholder images (SVG, labelled as sample) ----------
function placeholderSvg(label: string, color: string, size: number): string {
  const fontSize = Math.round(size / 14);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="100%" height="100%" fill="${color}"/>
  <rect x="${size * 0.1}" y="${size * 0.1}" width="${size * 0.8}" height="${size * 0.8}" rx="${size * 0.05}" fill="rgba(255,255,255,0.25)"/>
  <text x="50%" y="46%" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${esc(label)}</text>
  <text x="50%" y="58%" font-family="Arial, sans-serif" font-size="${Math.round(fontSize * 0.7)}" fill="rgba(255,255,255,0.85)" text-anchor="middle" dominant-baseline="middle">Sample image</text>
</svg>`;
}

function publicUrl(filePath: string): string {
  const encoded = encodeURIComponent(filePath);
  if (usingEmulators) {
    const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "127.0.0.1:9199";
    return `http://${host}/v0/b/${bucketName}/o/${encoded}?alt=media`;
  }
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media`;
}

async function uploadPlaceholder(basePath: string, id: string, label: string, color: string) {
  const path = `${basePath}/${id}.svg`;
  const thumbPath = `${basePath}/${id}_thumb.svg`;
  const meta = { contentType: "image/svg+xml", cacheControl: "public, max-age=3600" };
  await Promise.all([
    bucket.file(path).save(placeholderSvg(label, color, 1200), { metadata: meta }),
    bucket.file(thumbPath).save(placeholderSvg(label, color, 400), { metadata: meta }),
  ]);
  return { path, thumbPath, url: publicUrl(path), thumbUrl: publicUrl(thumbPath) };
}

// ---------- sample catalog ----------
type SeedItem = {
  name: string;
  code: string;
  section: string | null;
  description: string;
  specs: { label: string; value: string }[];
  variants: { name: string; options: string[] }[];
  price: number | null;
  unit: string;
  photos: number;
};
type SeedCategory = { name: string; description: string; sections: string[]; color: string; items: SeedItem[] };

const MATERIAL = { name: "Material", options: ["Rubber", "PVC", "Plastic"] };
const mould = (name: string, code: string, section: string, weight: string, size: string, price: number | null, photos = 2): SeedItem => ({
  name,
  code,
  section,
  description: `Sample data. ${name} mould for precast production. Smooth finish, easy de-moulding, long service life.`,
  specs: [
    { label: "Approx. mould weight", value: weight },
    { label: "Size", value: size },
    { label: "Finish", value: "Glossy" },
  ],
  variants: [MATERIAL],
  price,
  unit: "pcs",
  photos,
});

const CATALOG: SeedCategory[] = [
  {
    name: "Compound Wall Moulds",
    description: "Sample data. Moulds for precast compound wall systems: pillars, panels, copings and domes.",
    sections: ["Pillars", "Wall Panels", "Copings", "Domes"],
    color: "#1d4ed8",
    items: [
      mould("P3 Pillar Stone", "P3", "Pillars", "38 kg", "7 ft", 8500, 3),
      mould("P5 Pillar Round", "P5", "Pillars", "42 kg", "7 ft", 9200),
      mould("WP 801 7FT Royal Flora", "WP 801", "Wall Panels", "55 kg", "7 ft × 1 ft", 12500, 3),
      mould("WP 802 6FT Brick Wall", "WP 802", "Wall Panels", "48 kg", "6 ft × 1 ft", 11000),
      mould("C 401 Coping", "C 401", "Copings", "12 kg", "2 ft", 3200),
      mould("D 500 Decorative Dome", "D 500", "Domes", "9 kg", "12 in", 2800),
    ],
  },
  {
    name: "Paver Moulds",
    description: "Sample data. Interlocking paver block moulds in popular designs.",
    sections: ["Zig Zag", "I-Series", "3D Designs"],
    color: "#0f766e",
    items: [
      mould("ZZ 60 Zig Zag 60mm", "ZZ 60", "Zig Zag", "1.2 kg", "60 mm", 220),
      mould("ZZ 80 Zig Zag 80mm", "ZZ 80", "Zig Zag", "1.5 kg", "80 mm", 260),
      mould("I 60 I-Shape 60mm", "I 60", "I-Series", "1.3 kg", "60 mm", 230),
      mould("3D 100 Cobble", "3D 100", "3D Designs", "1.8 kg", "100 mm", 310),
      mould("3D 120 Wave", "3D 120", "3D Designs", "2.1 kg", "120 mm", 340),
    ],
  },
  {
    name: "Machines",
    description: "Sample data. Vibrating tables and mixers for precast work.",
    sections: ["Vibrating Tables", "Mixers"],
    color: "#b45309",
    items: [
      {
        name: "VT 1 Vibrating Table 4×2 ft",
        code: "VT 1",
        section: "Vibrating Tables",
        description: "Sample data. Heavy-duty vibrating table with adjustable amplitude.",
        specs: [
          { label: "Table size", value: "4 ft × 2 ft" },
          { label: "Motor", value: "1 HP" },
        ],
        variants: [{ name: "Power", options: ["Single phase", "Three phase"] }],
        price: 48000,
        unit: "sets",
        photos: 2,
      },
      {
        name: "MX 200 Pan Mixer 200 L",
        code: "MX 200",
        section: "Mixers",
        description: "Sample data. Pan mixer for colour concrete batches.",
        specs: [
          { label: "Capacity", value: "200 L" },
          { label: "Motor", value: "3 HP" },
        ],
        variants: [{ name: "Power", options: ["Single phase", "Three phase"] }],
        price: 95000,
        unit: "sets",
        photos: 1,
      },
    ],
  },
  {
    name: "Chemicals",
    description: "Sample data. Release agents and pigments.",
    sections: ["Release Agents", "Colours"],
    color: "#7c3aed",
    items: [
      {
        name: "RA 5 Mould Release Oil",
        code: "RA 5",
        section: "Release Agents",
        description: "Sample data. Release oil for rubber and PVC moulds.",
        specs: [{ label: "Pack size", value: "5 L can" }],
        variants: [{ name: "Pack", options: ["5 L", "20 L"] }],
        price: 850,
        unit: "pcs",
        photos: 1,
      },
      {
        name: "OX 1 Oxide Pigment Red",
        code: "OX 1",
        section: "Colours",
        description: "Sample data. Iron oxide pigment for coloured concrete.",
        specs: [{ label: "Pack size", value: "1 kg" }],
        variants: [{ name: "Colour", options: ["Red", "Yellow", "Black"] }],
        price: 180,
        unit: "pcs",
        photos: 1,
      },
    ],
  },
];

// ---------- helpers ----------
async function ensureDemoUser() {
  try {
    const user = await auth.getUserByEmail(DEMO_EMAIL);
    return user.uid;
  } catch {
    const user = await auth.createUser({ email: DEMO_EMAIL, password: DEMO_PASSWORD, displayName: "Demo Owner", emailVerified: true });
    return user.uid;
  }
}

async function deleteCollection(colPath: string) {
  const snap = await db.collection(colPath).get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function resetStore(storeId: string) {
  console.log(`Removing existing demo store ${storeId}…`);
  await deleteCollection(`stores/${storeId}/categories`);
  await deleteCollection(`stores/${storeId}/items`);
  const quotes = await db.collection("quotes").where("storeId", "==", storeId).get();
  const batch = db.batch();
  quotes.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(db.doc(`slugs/${STORE_SLUG}`));
  batch.delete(db.doc(`stores/${storeId}`));
  await batch.commit();
  await bucket.deleteFiles({ prefix: `stores/${storeId}/` }).catch(() => {});
}

// ---------- main ----------
async function main() {
  const uid = await ensureDemoUser();
  await db.doc(`users/${uid}`).set({ email: DEMO_EMAIL, name: "Demo Owner", createdAt: FieldValue.serverTimestamp() }, { merge: true });

  const slugSnap = await db.doc(`slugs/${STORE_SLUG}`).get();
  if (slugSnap.exists) {
    if (!RESET) {
      console.log(`Demo store "${STORE_SLUG}" already exists. Run with --reset to recreate it.`);
      return;
    }
    await resetStore(slugSnap.get("storeId"));
  }

  const storeRef = db.collection("stores").doc();
  const storeId = storeRef.id;
  console.log(`Creating demo store ${storeId} (/${STORE_SLUG})…`);

  const logo = await uploadPlaceholder(`stores/${storeId}/logo`, "logo", "JR", BRAND);

  await db.runTransaction(async (tx) => {
    tx.set(storeRef, {
      ownerId: uid,
      name: "JR Rubber Industries (Demo)",
      slug: STORE_SLUG,
      logo,
      about: "Sample data. Rubber, PVC and plastic moulds for precast compound walls and paver blocks. Exporting to 37+ countries.",
      brandColor: BRAND,
      whatsappNumber: "+919999999999",
      quotePrefix: "JR",
      quoteCounter: QUOTE_COUNTER_START,
      showPrices: false,
      currency: "INR",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.doc(`slugs/${STORE_SLUG}`), { storeId });
  });

  const itemSlugs = new Set<string>();
  const createdItems: { id: string; name: string; code: string; unit: string; thumbUrl: string; variant: Record<string, string> }[] = [];
  let itemOrder = 0;

  for (const [catIndex, cat] of CATALOG.entries()) {
    const catRef = db.collection(`stores/${storeId}/categories`).doc();
    const sections = cat.sections.map((name, i) => ({ id: `sec-${slugify(name)}`, name, order: i, visible: true }));
    const image = await uploadPlaceholder(`stores/${storeId}/categories/${catRef.id}`, "cover", cat.name, cat.color);
    await catRef.set({
      name: cat.name,
      slug: slugify(cat.name),
      image,
      description: cat.description,
      order: catIndex,
      visible: true,
      sections,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    for (const item of cat.items) {
      const itemRef = db.collection(`stores/${storeId}/items`).doc();
      let slug = slugify(`${item.code} ${item.name}`);
      let n = 2;
      while (itemSlugs.has(slug)) slug = `${slugify(`${item.code} ${item.name}`)}-${n++}`;
      itemSlugs.add(slug);
      const images = [];
      for (let p = 0; p < item.photos; p++) {
        images.push(await uploadPlaceholder(`stores/${storeId}/items/${itemRef.id}`, `photo-${p + 1}`, `${item.code} · ${p + 1}`, cat.color));
      }
      const sectionId = item.section ? sections.find((s) => s.name === item.section)?.id ?? null : null;
      await itemRef.set({
        categoryId: catRef.id,
        sectionId,
        name: item.name,
        slug,
        code: item.code,
        description: item.description,
        images,
        specs: item.specs,
        variants: item.variants,
        price: item.price,
        unit: item.unit,
        order: itemOrder++,
        visible: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      createdItems.push({
        id: itemRef.id,
        name: item.name,
        code: item.code,
        unit: item.unit,
        thumbUrl: images[0].thumbUrl,
        variant: item.variants[0] ? { [item.variants[0].name]: item.variants[0].options[0] } : {},
      });
    }
    console.log(`  ${cat.name}: ${cat.items.length} items`);
  }

  // Two sample quote requests so the inbox is not empty.
  const sampleQuotes = [
    { buyer: { name: "Amina Okafor", country: "Nigeria", note: "Sample data. Please quote CIF Lagos." }, items: createdItems.slice(0, 3), status: "new" },
    { buyer: { name: "Rahul Mehta", country: "India", note: "" }, items: createdItems.slice(6, 8), status: "contacted" },
  ];
  let counter = QUOTE_COUNTER_START;
  for (const q of sampleQuotes) {
    counter += 1;
    await db.collection("quotes").doc().set({
      storeId,
      quoteNumber: `JR-${counter}`,
      buyer: q.buyer,
      items: q.items.map((i, idx) => ({ itemId: i.id, name: i.name, code: i.code, selectedOptions: i.variant, qty: idx + 2, unit: i.unit, thumbUrl: i.thumbUrl })),
      status: q.status,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await storeRef.update({ quoteCounter: counter });

  console.log(`
Done.
  Sign in:   ${DEMO_EMAIL} / ${DEMO_PASSWORD}
  Catalog:   ${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/${STORE_SLUG}
  Dashboard: ${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dashboard`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
