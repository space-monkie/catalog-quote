import fs from "node:fs";
import path from "node:path";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";

export const PROJECT_ID = "demo-catalog-quote";

function hostPort(env: string | undefined, fallbackPort: number): { host: string; port: number } {
  const [host, port] = (env ?? `127.0.0.1:${fallbackPort}`).split(":");
  return { host, port: Number(port) };
}

export async function createTestEnv(): Promise<RulesTestEnvironment> {
  const root = path.resolve(__dirname, "../..");
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(root, "firestore.rules"), "utf8"),
      ...hostPort(process.env.FIRESTORE_EMULATOR_HOST, 8080),
    },
    storage: {
      rules: fs.readFileSync(path.join(root, "storage.rules"), "utf8"),
      ...hostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 9199),
    },
  });
}

export function validStore(ownerId: string, slug: string) {
  return {
    ownerId,
    name: "Test Store",
    slug,
    logo: null,
    about: "",
    brandColor: "#0f766e",
    whatsappNumber: "+919876543210",
    quotePrefix: "TS",
    quoteCounter: 1000,
    showPrices: false,
    currency: "INR",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function validCategory() {
  return { name: "Walls", slug: "walls", image: null, description: "", order: 0, visible: true, sections: [] };
}

export function validItem(categoryId: string) {
  return {
    categoryId,
    sectionId: null,
    name: "P3 Pillar",
    slug: "p3-pillar",
    code: "P3",
    description: "",
    images: [],
    specs: [],
    variants: [],
    price: null,
    unit: "pcs",
    order: 0,
    visible: true,
  };
}
