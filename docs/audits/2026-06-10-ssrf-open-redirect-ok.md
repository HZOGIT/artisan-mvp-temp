# Audit — SSRF & Open Redirect — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : tous les appels sortants serveur (`fetch`/`axios`/`new URL`) et toutes les
> redirections (`res.redirect`) dans `server/`.

---

## Conclusion : ni SSRF ni open redirect. Pas de BLOCKER/HIGH.

### Pas de SSRF — aucun fetch d'URL contrôlée par l'utilisateur

Sweep `fetch(/axios(/got(/https.request(/new URL(` sur `server/` :

| Appel sortant | Hôte | Source | Risque |
| -- | -- | -- | -- |
| `smsService.ts:52` | **`api.twilio.com`** (constant) | path = `TWILIO_ACCOUNT_SID` (env) ; `To/From/Body` en **POST `URLSearchParams`** (encodé) | ❌ aucun |
| `index.ts:1199` | **`generativelanguage.googleapis.com`** (constant) | token éphémère Gemini, clé en query (env) | ❌ aucun |
| `db.ts:93` `new URL(url)` | — | parse de **`DATABASE_URL`** (config) | ❌ aucun |
| Stripe / Resend | via SDK officiels | clés env | ❌ aucun |

→ **Aucun endpoint ne fetch une URL fournie en entrée.** Les vecteurs habituels sont
neutralisés autrement :

- **Upload logo** : `multipart` → fichier binaire (pas d'URL distante).
- **Import ERP** : lignes déjà **parsées côté client** (pas de fetch d'URL).
- **Analyse photo / justificatif** : **base64** inline (pas d'URL).
- **Webhook Stripe** : on **reçoit**, on ne fetch rien.

Les hôtes sortants sont une **allowlist de fait** (Twilio, Google, Stripe, Resend) en dur
→ pas de pivot vers un service interne / métadonnées cloud.

### Pas d'open redirect

`grep res.redirect|.redirect(` sur `server/` → **0**. Aucune redirection serveur, *a
fortiori* aucune vers une cible d'entrée. Les URLs de redirection Stripe (success/cancel)
sont construites côté serveur depuis **`process.env.APP_URL`** (cf. audits paiement), pas
depuis `req`.

---

## Réserve (déjà filée, hors périmètre)

- Le **`To`** du SMS (`normalizedPhone`) provient de fiches client/technicien ; l'absence
  de rate-limit sur l'envoi SMS = **OPE déjà filé** (SMS bombing / coûts Twilio). Ce n'est
  pas du SSRF.

---

## Verdict

Tous les appels sortants ciblent des **hôtes constants** (Twilio/Google/Stripe/Resend),
aucun ne consomme une **URL d'entrée**, et il n'existe **aucune** redirection serveur. Ni
**SSRF** ni **open redirect**. **Pas de nouvelle issue Linear.**
