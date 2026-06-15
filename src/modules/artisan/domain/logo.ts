// Validation PURE de l'upload de logo (parité legacy `/api/upload-logo`). Le logo est stocké en
// data-URL base64 (pas de StoragePort : la colonne `artisans.logo` porte directement le base64).

export const ALLOWED_LOGO_MIMES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
export const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 Mo (parité legacy multer limit)

export function isAllowedLogoMime(mimetype: string): boolean {
  return (ALLOWED_LOGO_MIMES as readonly string[]).includes(mimetype);
}

// Construit la data-URL base64 stockée en base (parité legacy).
export function logoDataUrl(mimetype: string, buffer: Buffer): string {
  return `data:${mimetype};base64,${buffer.toString("base64")}`;
}
