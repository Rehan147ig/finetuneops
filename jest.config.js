const nextJest = require("next/jest");

const createJestConfig = nextJest({
  dir: "./",
});

const customJestConfig = {
  testEnvironment: "node",
  testMatch: ["**/*.jest.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: [
    "src/lib/workflow-rules.ts",
    "src/lib/cost-estimator.ts",
    "src/lib/experiment-matrix.ts",
    "src/lib/nudge-engine.ts",
    "src/lib/review-links.ts",
    "src/app/api/health/route.ts",
    "src/app/api/traces/ingest/route.ts",
    "src/app/api/traces/[id]/route.ts",
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

module.exports = createJestConfig(customJestConfig);
