import { writeFile } from "node:fs/promises";

const config = {
  appId: "com.hxzhu1222.mayuan",
  appName: "Mayuan Review Notes",
  webDir: "dist"
};

await writeFile("capacitor.config.json", `${JSON.stringify(config, null, 2)}\n`);
