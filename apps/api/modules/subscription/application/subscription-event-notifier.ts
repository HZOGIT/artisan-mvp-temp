import type { SignatureNotificationType } from "../../signature/application/signature-repository";

// Notifications/emails best-effort des évènements abonnement (parité legacy : notif in-app + email à
// l'utilisateur propriétaire de l'artisan). Résout l'email via artisans.userId→users.email (HORS RLS).
// JAMAIS bloquant (l'appelant wrappe en try/catch ; ces effets ne doivent pas faire échouer le webhook).
export interface SubscriptionEventNotifier {
  // Notification in-app pour l'artisan (table notifications, scopée artisanId).
  notifyArtisan(artisanId: number, notif: { type: SignatureNotificationType; titre: string; message: string; lien: string }): Promise<void>;
  // Email à l'utilisateur propriétaire de l'artisan (résout users.email ; no-op si absent).
  emailArtisanOwner(artisanId: number, subject: string, html: string): Promise<void>;
}
