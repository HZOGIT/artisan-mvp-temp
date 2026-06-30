export default {
  "drizzle/*.sql": (files) => `squawk ${files.join(" ")}`,
  "apps/api/**/*.ts": (files) => [
    `eslint -c eslint.api.config.mjs --max-warnings=-1 --no-warn-ignored --cache --cache-strategy=content --cache-location node_modules/.cache/eslint/api/ ${files.join(" ")}`,
    `vitest related --run --passWithNoTests -c vitest.unit.api.config.ts ${files.join(" ")}`,
  ],
  "apps/web/src/**/*.{ts,tsx}": (files) => [
    `eslint -c eslint.web.config.mjs --max-warnings=-1 --cache --cache-strategy=content --cache-location node_modules/.cache/eslint/web/ ${files.join(" ")}`,
    `vitest related --run --passWithNoTests -c vitest.web.config.ts ${files.join(" ")}`,
  ],
};
