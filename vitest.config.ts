import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Force the preact JSX runtime for every transform. tsconfig sets
  // jsxImportSource:preact, but Vite only honours that for files inside the
  // tsconfig `include`; __tests__/ is excluded, so those files would fall back
  // to the "react" runtime (which this preact project does not depend on).
  // Vite 8 transforms with oxc (not esbuild), so the option lives under `oxc`.
  oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
  test: {
    globals: true,
    environment: "node",
    // Collect both legacy __tests__/ suites and CDD co-located *.test.* files
    // that live next to the component they cover (FSD/CDD layout).
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**", "src/**/__mocks__/**", "src/**/*.test.{ts,tsx}"],
    },
    alias: {
      vscode: path.resolve(__dirname, "src/__mocks__/vscode.ts"),
    },
  },
});
