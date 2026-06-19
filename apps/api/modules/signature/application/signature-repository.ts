import type { TenantContext } from "../../../shared/tenant";
import type { Signature, NewSignature } from "../domain/signature";

/*
 * Accès aux lignes `signatures_devis` (HORS RLS — pas d'artisanId). L'anti-IDOR est garanti EN AMONT
 * par le use-case (lecture RLS du devis parent pour prouver l'appartenance au tenant) ; ce repo ne
 * fait QUE la persistance par devisId / token. `create` est idempotent côté use-case (vérif préalable).
 */
export interface ISignatureRepository {
  getByDevisId(devisId: number): Promise<Signature | null>;
  getByToken(token: string): Promise<Signature | null>;
  create(data: NewSignature): Promise<Signature>;
}

/*
 * Contexte d'un devis pour composer le lien de signature, lu SOUS LE TENANT (RLS) → renvoie `null`
 * si le devis n'appartient pas au tenant (preuve d'appartenance = anti-IDOR du parent). Inclut les
 * infos client (destinataire de l'email) et artisan (expéditeur / raison sociale).
 */
export interface SignatureDevisContext {
  readonly devis: {
    readonly id: number;
    readonly clientId: number;
    readonly numero: string;
    readonly objet: string | null;
    readonly totalTTC: number;
  };
  readonly client: { readonly email: string | null; readonly prenom: string | null; readonly nom: string | null } | null;
  readonly artisan: { readonly nomEntreprise: string | null; readonly email: string | null } | null;
}

export interface SignatureDevisContextReader {
  getDevisContext(ctx: TenantContext, devisId: number): Promise<SignatureDevisContext | null>;
}

// Type de notification (parité enum `notifications.type`).
export type SignatureNotificationType = "erreur" | "info" | "alerte" | "rappel" | "succes";

// Écriture d'une notification artisan (sous le tenant, RLS). Réutilise la table `notifications`.
export interface SignatureNotificationWriter {
  notify(
    ctx: TenantContext,
    notif: { type: SignatureNotificationType; titre: string; message: string; lien?: string },
  ): Promise<void>;
}
