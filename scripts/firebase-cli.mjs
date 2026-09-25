#!/usr/bin/env node
// Runs the Firebase CLI. The emulators need Java; if `java` is not on PATH this
// looks in the usual Homebrew / Temurin locations and adds the first one it finds.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const candidates = [
  process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, "bin"),
  "/opt/homebrew/opt/openjdk/bin",
  "/opt/homebrew/opt/openjdk@21/bin",
  "/opt/homebrew/opt/openjdk@17/bin",
  "/usr/local/opt/openjdk/bin",
  "/usr/local/opt/openjdk@21/bin",
  "/usr/local/opt/openjdk@17/bin",
  "/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home/bin",
  "/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home/bin",
  "/usr/lib/jvm/default-java/bin",
].filter(Boolean);

function javaWorks(env) {
  const result = spawnSync("java", ["-version"], { env, stdio: "ignore" });
  return result.status === 0;
}

const env = { ...process.env };
if (!javaWorks(env)) {
  const found = candidates.find((dir) => existsSync(path.join(dir, "java")));
  if (!found) {
    console.error(
      "Java was not found. The Firebase emulators need a JDK (17+).\n" +
        "  macOS:  brew install openjdk\n" +
        "  Other:  https://adoptium.net\n" +
        "Then run this command again.",
    );
    process.exit(1);
  }
  env.PATH = `${found}${path.delimiter}${env.PATH ?? ""}`;
  console.log(`Using Java from ${found}`);
}

const firebase = path.join(process.cwd(), "node_modules", ".bin", "firebase");
const child = spawn(firebase, process.argv.slice(2), { env, stdio: "inherit" });
// Let Ctrl+C reach the CLI so it can export emulator data before exiting.
process.on("SIGINT", () => {});
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
