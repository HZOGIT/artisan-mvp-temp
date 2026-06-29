export const MAX_PIECES_PAR_DOC = 10;
export const MAX_PIECE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];
