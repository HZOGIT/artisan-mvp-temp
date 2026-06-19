/** Port de stockage d'objets (justificatifs, photos, PDF générés…). */
export interface PutOptions {
  readonly contentType?: string;
}

export interface StoragePort {
  put(key: string, body: Buffer, opts?: PutOptions): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  url(key: string): Promise<string>;
}
