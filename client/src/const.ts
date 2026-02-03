export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Get environment variable with fallback and validation
 */
function getEnvVar(key: string, fallback: string = ""): string {
  const value = import.meta.env[key as any];
  if (!value && !fallback) {
    console.warn(`⚠️ Environment variable ${key} is not defined`);
  }
  return value || fallback;
}

/**
 * Get login URL - redirects to local sign-in page
 * Using email/password authentication instead of OAuth
 */
export const getLoginUrl = () => {
  return "/sign-in";
};
