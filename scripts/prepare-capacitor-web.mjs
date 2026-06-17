import { cp, mkdir, rm } from "node:fs/promises";

const webFiles = ["index.html", "css", "js", "data", "assets"];

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

for (const entry of webFiles) {
  await cp(entry, `dist/${entry}`, { recursive: true });
}
