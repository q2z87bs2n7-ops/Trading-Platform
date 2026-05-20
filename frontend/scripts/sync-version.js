import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dir = fileURLToPath(new URL(".", import.meta.url));
const versionFile = resolve(__dir, "../../VERSION");
const packageFile = resolve(__dir, "../package.json");

const version = readFileSync(versionFile, "utf8").trim();
const pkg = JSON.parse(readFileSync(packageFile, "utf8"));

if (pkg.version !== version) {
  pkg.version = version;
  writeFileSync(packageFile, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`✓ Synced package.json version to ${version}`);
}
