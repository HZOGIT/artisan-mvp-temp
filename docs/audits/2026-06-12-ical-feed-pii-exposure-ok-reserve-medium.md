# Audit — Flux iCal `/api/calendar/:token.ics` : sécurité du jeton & exposition PII ✅ OK (1 réserve MEDIUM data-minimization)

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Domaine** : Calendrier / synchronisation externe (OPE-156)

> Audit du flux d'abonnement iCal récemment livré (OPE-156, *In Review*). Route publique
> `app.get('/api/calendar/:token.ics')` (`server/_core/index.ts:670`), jeton émis par
> `calendrierRouter.getIcalFeed` / `regenerateIcalFeed` (`server/routers.ts:8341-8359`).

---

## Conclusion : pas de BLOCKER/HIGH. Le contrôle d'accès est sain. Une **réserve MEDIUM** de minimisation des données (RGPD Art. 5.1.c).

### ✅ Contrôle d'accès — solide

| Aspect | Constat | Réf. |
| -- | -- | -- |
| **Entropie du jeton** | `randomBytes(24).toString("hex")` = **48 hex / 192 bits** — non devinable, non énumérable | `routers.ts:8346,8356` |
| **Opt-in** | Le jeton n'est créé qu'à la **1ʳᵉ** ouverture de `getIcalFeed` par l'artisan ; aucun flux n'existe tant qu'il n'a pas activé | `routers.ts:8344-8348` |
| **Révocable** | `regenerateIcalFeed` régénère le jeton → l'ancien lien est immédiatement mort | `routers.ts:8353-8359` |
| **Scoping tenant** | `getArtisanByIcalToken(token)` → `getInterventionsByArtisanId(artisan.id)` : un jeton ne voit **que** les interventions de **son** artisan. Pas de cross-tenant, pas d'IDOR | `index.ts:675,683` |
| **Anti-abus** | `checkIpRouteLimit(req, pdfRouteHits, 60, 60_000)` (60 req/min/IP) | `index.ts:672` |
| **Lecture seule** | `GET` uniquement, aucune mutation | `index.ts:670` |
| **Fenêtre bornée** | Interventions à partir de J-90 (pas tout l'historique) | `index.ts:682-684` |

→ **Pas de fuite cross-tenant, pas d'énumération, pas d'écriture.** Le modèle « URL-secret porteuse » est l'état de l'art des flux webcal (identique à Google Calendar/Outlook).

### 🟡 Réserve MEDIUM — minimisation des données (RGPD Art. 5.1.c)

Chaque `VEVENT` expose des **PII de tiers** (les clients de l'artisan) :

```js
// index.ts:700,708
const descParts = [i.description, clientNom ? `Client : ${clientNom}` : '', client?.telephone ? `Tél : ${client.telephone}` : ''];
…
...(i.adresse ? [`LOCATION:${icalText(i.adresse)}`] : []),   // adresse du chantier
...(descParts.length ? [`DESCRIPTION:${icalText(descParts.join('\n'))}`] : []),  // nom + téléphone client
```

- Une URL d'abonnement iCal est **récupérée et mise en cache côté serveur** par le fournisseur de calendrier de l'artisan (Google/Apple/Outlook). Ces champs (**nom, téléphone, adresse** du client) **quittent donc Operioz vers un sous-traitant tiers** non déclaré dans la politique de confidentialité.
- **Pourquoi MEDIUM et non HIGH/BLOCKER** : flux **opt-in**, jeton fort et **révocable**, données **intra-tenant** (les propres clients de l'artisan, dont il est déjà responsable de traitement). Même surface de confiance que l'artisan qui s'auto-envoie son planning par e-mail. Pas de fuite cross-tenant. Sous le seuil de blocage du lancement.
- **Piste de durcissement** (à intégrer à la recette d'OPE-156, pas un ticket « Lancement » distinct) :
  - retirer le **téléphone** du `DESCRIPTION` (le moins nécessaire à un agenda) ;
  - rendre l'**adresse** (`LOCATION`) et le **nom client** **optionnels** (toggle « inclure les détails client dans le flux ») ;
  - documenter Google/Apple comme destinataires possibles dans la politique de confidentialité.

## Verdict

Le flux iCal est **correctement protégé** : jeton 192 bits opt-in/révocable, scoping tenant strict, rate-limit, lecture seule. **Aucun problème BLOCKER/HIGH** → **pas de nouvelle issue « Lancement 30 juin »**. Réserve **MEDIUM** de minimisation des données (téléphone/adresse/nom client vers le fournisseur de calendrier tiers) **notée en enrichissement d'OPE-156** (feature encore *In Review*) plutôt qu'en doublon.
