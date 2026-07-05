import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    conditions: ["types", "import", "module", "default"],
    alias: {
      "@warehouser/shared-types": fileURLToPath(
        new URL("../../packages/shared-types/src/index.ts", import.meta.url)
      )
    }
  }
});
