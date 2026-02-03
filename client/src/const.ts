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
 * Get Manus OAuth login URL
 * Constructs the OAuth authorization URL with proper parameters
 */
export const getLoginUrl = () => {
  const oauthPortalUrl = getEnvVar("VITE_OAUTH_PORTAL_URL", "https://oauth.manus.im");
  const appId = getEnvVar("VITE_APP_ID", "");
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  
  if (!appId) {
    console.error("❌ VITE_APP_ID is not configured");
    return "/sign-in"; // Fallback to local sign-in page
  }
  
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email",
  });
  
  const loginUrl = `${oauthPortalUrl}/authorize?${params.toString()}`;
  console.log("🔐 OAuth Login URL:", loginUrl);
  return loginUrl;
};
