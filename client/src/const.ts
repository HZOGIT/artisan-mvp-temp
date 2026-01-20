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

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const oauthPortalUrl = getEnvVar(
    "VITE_OAUTH_PORTAL_URL",
    "https://manus.im" // Fallback for development
  );
  const appId = getEnvVar(
    "VITE_APP_ID",
    "local-dev-app-id" // Fallback for development
  );

  if (!oauthPortalUrl || !appId) {
    throw new Error(
      "Missing required environment variables: VITE_OAUTH_PORTAL_URL or VITE_APP_ID"
    );
  }

  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  try {
    const url = new URL(`${oauthPortalUrl}/app-auth`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");

    return url.toString();
  } catch (error) {
    console.error(
      `❌ Failed to construct login URL with oauthPortalUrl="${oauthPortalUrl}" and appId="${appId}"`,
      error
    );
    throw error;
  }
};
