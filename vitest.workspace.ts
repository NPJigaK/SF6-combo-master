import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "core",
      environment: "node",
      include: ["packages/core/tests/**/*.test.ts"],
    },
  },
  {
    test: {
      name: "practice-app",
      environment: "jsdom",
      include: ["packages/practice-app/src/**/*.test.ts?(x)"],
      setupFiles: ["@testing-library/jest-dom/vitest"],
    },
  },
]);
