import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { createTestEnv, validStore } from "./helpers";

let env: RulesTestEnvironment;
const OWNER = "owner-uid";
const OTHER = "other-uid";
const STORE = "store-a";
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "stores", STORE), validStore(OWNER, "store-a"));
  });
});

describe("storage rules", () => {
  it("owner can upload images under their store and delete them", async () => {
    const storage = env.authenticatedContext(OWNER).storage();
    const fileRef = ref(storage, `stores/${STORE}/items/i1/a.png`);
    await assertSucceeds(uploadBytes(fileRef, png, { contentType: "image/png" }));
    await assertSucceeds(deleteObject(fileRef));
  });

  it("rejects non-images and oversized files", async () => {
    const storage = env.authenticatedContext(OWNER).storage();
    await assertFails(uploadBytes(ref(storage, `stores/${STORE}/items/i1/a.txt`), png, { contentType: "text/plain" }));
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    await assertFails(uploadBytes(ref(storage, `stores/${STORE}/items/i1/big.png`), big, { contentType: "image/png" }));
  });

  it("other users and anonymous clients cannot upload", async () => {
    await assertFails(uploadBytes(ref(env.authenticatedContext(OTHER).storage(), `stores/${STORE}/logo/x.png`), png, { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(env.unauthenticatedContext().storage(), `stores/${STORE}/logo/x.png`), png, { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(env.authenticatedContext(OWNER).storage(), `other/x.png`), png, { contentType: "image/png" }));
  });

  it("catalog images are publicly readable", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), `stores/${STORE}/items/i1/a.png`), png, { contentType: "image/png" });
    });
    await assertSucceeds(getBytes(ref(env.unauthenticatedContext().storage(), `stores/${STORE}/items/i1/a.png`)));
  });
});
