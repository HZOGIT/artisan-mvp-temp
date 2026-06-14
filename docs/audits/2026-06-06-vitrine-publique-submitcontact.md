# Audit — Vitrine publique (`vitrineRouter`)

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

> Périmètre : page vitrine publique par slug (`getBySlug`) et formulaire de
> contact public (`submitContact`) — endpoints **non authentifiés**
> (`server/routers.ts:7463`).

---

## Ce qui fonctionne correctement

- `getBySlug` (`routers.ts:7464`) n'expose que des données **destinées à être
  publiques** (nom entreprise, spécialité, téléphone, email pro, adresse, SIRET,
  logo, avis publiés) et **uniquement si `vitrineActive`** (opt-in explicite).
  Pas de fuite de données privées (clients, devis, CA détaillé). ✓
- Les avis affichés sont les avis **publiés** uniquement. ✓
- `checkSlug` est en `protectedProcedure` + scope artisan. ✓

---

## 🟠 HIGH — Formulaire de contact public (`submitContact`) : injection HTML dans l'email + aucune limitation de débit

`submitContact` (`routers.ts:7509`) est une `publicProcedure` (aucune auth) qui
envoie un email à l'artisan. Deux défauts exploitables par n'importe qui sur
Internet (les vitrines sont publiques et indexables) :

### 1. Injection HTML dans l'email reçu par l'artisan

Les champs `nom`, `email`, `telephone`, `message` sont insérés **bruts** dans le
corps HTML de l'email, sans échappement :

```typescript
// routers.ts:7526-7530
<p><strong>Nom :</strong> ${input.nom}</p>
<p><strong>Email :</strong> ${input.email}</p>
${input.telephone ? `<p><strong>Telephone :</strong> ${input.telephone}</p>` : ''}
<p style="white-space:pre-wrap;">${input.message}</p>
```

`sendEmail` transmet ce corps tel quel à Resend (`html: body`, aucun
échappement — `emailService.ts`). Un attaquant peut donc injecter du HTML/des
liens arbitraires dans un email **branded Operioz** reçu par l'artisan :
ex. `message = "<a href='https://evil/login'>Validez votre compte Operioz</a>"`
ou un faux bloc « support Operioz ». **Vecteur de phishing crédible ciblant
l'artisan**, déclenchable sans authentification.

> Même classe de bug que OPE-12 (injection HTML dans `customMessage` des emails
> devis/facture), mais ici l'entrée est **100 % non authentifiée** (n'importe
> qui, pas un artisan connecté) et la cible est **l'artisan lui-même**.

### 2. Aucune limitation de débit → flood d'inbox + coûts Resend

Le rate limiter global tRPC ne cible **que** `auth.signin` / `auth.signup`
(`index.ts:~210`). `submitContact` n'a **aucune** limite. Un attaquant peut
boucler sur l'endpoint :
- **Flood de la boîte mail** de l'artisan (harcèlement, noyade des vrais
  contacts).
- **Burn du quota / coûts Resend** (tous ces emails partent du compte Resend de
  la plateforme).
- Génération illimitée de notifications en base (`createNotification` à chaque
  appel).

### Fix proposé

1. **Échapper** tous les champs utilisateur avant insertion HTML (réutiliser le
   helper `escapeHtml` déjà présent dans `webhookHandler.ts`) :
   ```typescript
   <p><strong>Nom :</strong> ${escapeHtml(input.nom)}</p>
   <p style="white-space:pre-wrap;">${escapeHtml(input.message)}</p>
   ```
2. **Rate limit** `submitContact` par `(slug, IP)` : cooldown 60 s + plafond
   journalier (ex. 5/jour/IP, 20/jour/slug). Réutiliser le pattern Map en mémoire
   déjà utilisé pour l'auth.
3. Optionnel : `replyTo: input.email` pour que l'artisan réponde directement, et
   `z.string().max()` sur `message`/`nom` pour borner la taille.

### Estimation

~1 h — échappement + rate limit in-memory + bornes Zod.

---

## Estimation totale

- HIGH (injection HTML + absence de rate limit sur `submitContact`) : ~1 h
