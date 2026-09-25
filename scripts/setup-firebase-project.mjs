#!/usr/bin/env node
/**
 * One-time project setup that the Firebase console normally does by hand:
 *   - initialises Firebase Authentication and enables Email/Password sign-in
 *   - tries to enable Google sign-in (needs an OAuth client; falls back to a console link)
 *   - creates the default Cloud Storage bucket in the given location
 *   - reports the billing plan
 *
 * Uses the Firebase CLI's own login (run `npx firebase login` first).
 *   node scripts/setup-firebase-project.mjs <projectId> [location]
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { requireAuth } = require("firebase-tools/lib/requireAuth");
const { getGlobalDefaultAccount } = require("firebase-tools/lib/auth");
const { Client } = require("firebase-tools/lib/apiv2");
const { ensure } = require("firebase-tools/lib/ensureApiEnabled");
const identityPlatform = require("firebase-tools/lib/gcp/identityPlatform");

const project = process.argv[2];
const location = (process.argv[3] || "asia-south1").toLowerCase();
if (!project) {
  console.error("Usage: node scripts/setup-firebase-project.mjs <projectId> [location]");
  process.exit(1);
}

const account = getGlobalDefaultAccount();
if (!account) {
  console.error("Not logged in. Run: npx firebase login");
  process.exit(1);
}
const options = { project, projectId: project, nonInteractive: true, user: account.user, tokens: account.tokens };
await requireAuth(options);
console.log(`Signed in as ${account.user.email}, project ${project}`);

const summary = [];
const describe = (err) => err?.context?.body?.error?.message || err?.message || String(err);

// ---- billing ----
try {
  const billing = new Client({ urlPrefix: "https://cloudbilling.googleapis.com", apiVersion: "v1" });
  const info = (await billing.get(`projects/${project}/billingInfo`)).body;
  summary.push(`Billing: ${info.billingEnabled ? `enabled (${info.billingAccountName})` : "NOT enabled - upgrade to Blaze in the console"}`);
} catch (err) {
  summary.push(`Billing: could not check (${describe(err)})`);
}

// ---- authentication ----
await ensure(project, "https://identitytoolkit.googleapis.com", "auth", true);
const identity = new Client({ urlPrefix: "https://identitytoolkit.googleapis.com", apiVersion: "v2" });
try {
  await identity.post(`projects/${project}/identityPlatform:initializeAuth`, {});
  summary.push("Authentication: initialised");
} catch (err) {
  const msg = describe(err);
  summary.push(/already|ALREADY_EXISTS/i.test(msg) ? "Authentication: already initialised" : `Authentication init: ${msg}`);
}
try {
  await identityPlatform.updateConfig(project, { signIn: { email: { enabled: true, passwordRequired: true } } }, "signIn.email.enabled,signIn.email.passwordRequired");
  summary.push("Email/Password sign-in: enabled");
} catch (err) {
  summary.push(`Email/Password sign-in: FAILED (${describe(err)})`);
}
const admin = new Client({ urlPrefix: "https://identitytoolkit.googleapis.com/admin", apiVersion: "v2" });
try {
  const existing = (await admin.get(`projects/${project}/defaultSupportedIdpConfigs`)).body;
  const google = existing?.defaultSupportedIdpConfigs?.find((c) => c.name.endsWith("/google.com"));
  if (google?.enabled) {
    summary.push("Google sign-in: already enabled");
  } else {
    await admin.post(`projects/${project}/defaultSupportedIdpConfigs`, { enabled: true }, { queryParams: { idpId: "google.com" } });
    summary.push("Google sign-in: enabled");
  }
} catch (err) {
  summary.push(
    `Google sign-in: needs the console (${describe(err)}). ` +
      `Open https://console.firebase.google.com/project/${project}/authentication/providers and enable Google.`,
  );
}

// ---- storage default bucket ----
await ensure(project, "https://firebasestorage.googleapis.com", "storage", true);
const storage = new Client({ urlPrefix: "https://firebasestorage.googleapis.com", apiVersion: "v1beta" });
try {
  const current = (await storage.get(`projects/${project}/defaultBucket`)).body;
  summary.push(`Storage: default bucket already exists (${current.bucket?.name?.split("/").pop()}, ${current.location})`);
} catch (err) {
  if (err?.status === 404) {
    try {
      const created = (await storage.post(`projects/${project}/defaultBucket`, { location: location.toUpperCase() })).body;
      summary.push(`Storage: created default bucket ${created.bucket?.name?.split("/").pop() ?? ""} in ${created.location ?? location}`);
    } catch (err2) {
      summary.push(
        `Storage: could not create the default bucket (${describe(err2)}). ` +
          `Open https://console.firebase.google.com/project/${project}/storage and click Get started (location ${location}).`,
      );
    }
  } else {
    summary.push(`Storage: could not check (${describe(err)})`);
  }
}

console.log("\nSummary");
for (const line of summary) console.log(`  - ${line}`);
