/*
 * Port d'envoi d'email. Les use-cases en dépendent (interface), jamais d'une impl
 * concrète. `send` résout en cas de succès, rejette (throw) sinon.
 */

/*
 * Pièce jointe (ex. PDF facture/devis/bon de commande). `content` = binaire ; l'adapter
 * se charge de l'encodage (base64) requis par le transport.
 */
export interface EmailAttachment {
  readonly filename: string;
  readonly content: Buffer;
  readonly contentType?: string;
}

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  /** Optionnel : pièces jointes (rétro-compatible — les appelants existants n'en fournissent pas). */
  readonly attachments?: readonly EmailAttachment[];
  /** Nom affiché de l'expéditeur (ex. « Plomberie Martin »). Domaine d'enveloppe inchangé → DKIM/SPF préservés. */
  readonly fromName?: string;
  /** Adresse de réponse (ex. email de l'artisan). Sanitisation CRLF appliquée dans l'adapter. */
  readonly replyTo?: string;
  /**
   * URL de désinscription pré-signée (lifecycle/marketing uniquement).
   * Quand présente : l'adapter ajoute les headers RFC 8058 List-Unsubscribe + List-Unsubscribe-Post
   * et un lien visible en pied de corps HTML.
   * Absente sur les emails transactionnels (facture, devis, relance…).
   */
  readonly unsubscribeUrl?: string;
}

export interface EmailPort {
  send(message: EmailMessage): Promise<void>;
}
