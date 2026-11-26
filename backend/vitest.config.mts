import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      src: path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["**/*.e2e-spec.ts", "**/*.spec.ts"],
    exclude: ["**/node_modules/**"],
    globals: true,
    environment: "node",
    // The app won't start without these. Tests never contact this issuer.
    env: {
      KEYCLOAK_ISSUER: "https://sso.example.test/auth/realms/standard",
      KEYCLOAK_CLIENT_ID: "chosen-test",
    },
    coverage: {
      provider: "v8",
      reporter: ["lcov", "text-summary", "text", "json", "html"],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/coverage/**',
        '**/*.config.*',
        '**/*.spec.ts',
        '**/*.e2e-spec.ts',
      ],
    },
  },
  plugins: [swc.vite()],
});
