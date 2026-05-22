import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**", "src/**/__mocks__/**"],
    },
    alias: {
      vscode: path.resolve(__dirname, "src/__mocks__/vscode.ts"),
    },
  },
});
