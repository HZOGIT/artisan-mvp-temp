/** Résultat d'un upload : entrée dans la table `files`. */
export interface StoredFile {
  readonly id: number;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface UploadOptions {
  readonly contentType?: string;
  readonly artisanId?: number;
  readonly filename?: string;
  readonly purpose?: string;
}

/** Port de stockage d'objets (justificatifs, photos, PDF générés…). */
export interface StoragePort {
  upload(key: string, body: Buffer, opts?: UploadOptions): Promise<StoredFile>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  url(key: string): Promise<string>;
}
