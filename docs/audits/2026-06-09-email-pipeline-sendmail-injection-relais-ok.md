# Audit — Pipeline email (`sendEmail`) : injection d'en-tête / relais / destinataire — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `server/_core/emailService.ts` — `sendEmail` (`:24`), validation du
> destinataire, templates `generateDevis/Facture/RappelContent`, `baseTemplate` +
> emails transactionnels abonnement ; ~30 sites d'appel (`routers.ts`, `index.ts`,
> `assistantTools.ts`, `webhookHandler.ts`).

---

## Conclusion : pipeline email sain (pas d'injection d'en-tête, pas de relais). Pas de BLOCKER/HIGH **nouveau**.

### 1) Pas d'injection d'en-tête SMTP ni de CRLF dans le destinataire

- `to` validé par `^[^\s@]+@[^\s@]+\.[^\s@]+$` (`:31-34`) : `\s` **exclut CR/LF/espaces**
  → impossible d'injecter `\r\nBcc:` ou un second destinataire.
- L'envoi passe par **l'API Resend en JSON** (`resend.emails.send({to, subject, html})`,
  `:43-60`), **pas** par une concaténation d'en-têtes SMTP → le `subject` (qui contient
  des données utilisateur comme `devisObjet`) ne peut **pas** devenir un en-tête injecté.

### 2) Pas de relais de spam (destinataire non arbitraire)

Revue des ~30 appelants : le `to` provient **toujours** d'une donnée serveur/tenant —
`client.email`, `artisan.email`, `row.email` (boucles scheduler sur les clients du
tenant), ou une adresse **fixe** (`SUPPORT_EMAIL`). Aucun endpoint ne relaie un email
**au contenu libre** vers une adresse arbitraire fournie en requête. (Les invitations
collaborateurs ciblent une adresse d'entrée mais avec un **contenu templaté fixe** →
vecteur de spam négligeable.)

### 3) Destinataire unique + champs maîtrisés

`to` est une **string unique** (pas de tableau/CC/BCC exposé). `from`/`replyTo` sont
**codés en dur** (`ENV.emailFrom`, `support@operioz.com`) → pas d'usurpation d'expéditeur
côté appelant.

### 4) Templates abonnement : HTML échappé

`baseTemplate` + `buildTrialEnding*/PaymentConfirmed/Failed/Discovery/Canceled` passent
les données utilisateur (`firstName`, `planName`, `title`, `ctaLabel`) par `escapeHtml`
(`:324-328`) → pas d'injection HTML sur ces emails transactionnels.

---

## Réserve LOW — templates devis/facture/rappel non échappés (artisan-controlled)

`generateDevisEmailContent` / `generateFactureEmailContent` / `generateRappelFactureContent`
interpolent `artisanName`, `clientName`, `devisObjet`, `factureObjet`… **sans
`escapeHtml`** (ex. `:101`, `:108-109`, `:198`). Mais :

- ces champs sont **renseignés par l'artisan** (sa raison sociale, l'objet de SON devis,
  la fiche de SON client) et l'email part **vers le client de cet artisan** → **self-XSS**
  / phishing de son propre client, faible valeur d'attaque ;
- les clients de messagerie (Gmail/Outlook) **n'exécutent pas de JS** dans le HTML d'email
  → au pire de l'injection de balises/liens, pas de script ;
- les **vrais** points où une donnée **client/signataire** (non maîtrisée par l'artisan)
  atteint un email sont **déjà filés** : « Injection HTML emails (sweep) — 4 points
  client/signataire » et « Injection HTML dans customMessage emails devis/facture ».

→ **LOW**, sous le seuil BLOCKER/HIGH + recouvre des issues existantes → **pas d'issue**.
*(La simulation silencieuse `success:true` si `RESEND_API_KEY` absent est aussi déjà
filée.)*

---

## Verdict

`sendEmail` : destinataire **validé** (anti-CRLF), envoi **JSON Resend** (pas d'en-tête
SMTP injectable), **pas de relais** (recipients issus de la DB/tenant), `from` fixe,
templates abonnement **échappés**. Résiduel = injection HTML **LOW** sur des champs
artisan-controlled, par ailleurs déjà tracée pour les champs client/signataire. **Pas de
nouvelle issue Linear.**
