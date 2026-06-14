# Audit — Flux iCal public `/api/calendar/:token.ics` : sécurité ✅ OK (aucun BLOCKER)

**Date** : 2026-06-13 · **Projet** : Lancement 30 juin · **Domaine** : Sécurité API — flux calendrier public (abonnement iCal externe)

> Endpoint **public** `GET /api/calendar/:token.ics` (`server/_core/index.ts:670`) servant un
> flux iCal des interventions de l'artisan, à abonner dans Google/Apple Calendar (donc **sans
> cookie** : le token EST le credential). Vecteurs : entropie/brute-force du token, scoping tenant,
> **injection iCal** (CRLF dans un titre forgeant des propriétés VEVENT), exfiltration, DoS.

---

## ✅ Token = credential crypto-fort, scopé, révocable

- **Entropie** : `icalToken = randomBytes(24).toString("hex")` (`routers.ts:8650`) → **48 hex = 192 bits**, non devinable / non brute-forçable.
- **Révocable** : endpoint de **régénération** (`routers.ts:8660-8661` : nouveau `randomBytes(24)` → `updateArtisan`) → si le lien fuite, l'artisan le tourne.
- **Validation** : `token ? getArtisanByIcalToken(token) : undefined` ; token vide/inconnu → **404** (`index.ts:674-676`). Lookup exact `WHERE icalToken = ?` (`db.ts:254`).

## ✅ Scoping tenant strict

`getInterventionsByArtisanId(artisan.id)` (`:683`) — le flux ne contient **que** les interventions de l'artisan résolu depuis le token. Chaque artisan a **son** token. → **pas de fuite cross-tenant**. Fenêtre bornée (interventions des 90 derniers jours et au-delà, `:682-684`).

## ✅ Injection iCal neutralisée

`icalText(s)` (`:678`) échappe **`\` → `\\`**, **`;` → `\;`**, **`,` → `\,`**, et **`\r?\n` → `\n`** (littéral). Appliqué à **`SUMMARY`** (`:707`), **`LOCATION`** (`:708`), **`DESCRIPTION`** (`:709`) et `X-WR-CALNAME` (`:692`). → un titre/adresse contenant des **CRLF** ne peut **pas** forger de nouvelle propriété/VEVENT (RFC 5545 content-line escaping respecté). Les `UID`/`DTSTART`/`DTEND`/`DTSTAMP` sont des valeurs **système** (id numérique, dates ISO via `icalDate`). ✓

## ✅ Anti-DoS

`checkIpRouteLimit(req, pdfRouteHits, 60, 60_000)` (`:672`) → **60 req/min/IP**, sinon **429**. Un abonnement calendrier poll quelques fois/heure → largement sous le seuil ; un scrapeur est borné.

## Note (par conception, non-finding)

Le flux expose **nom + téléphone du client** dans `DESCRIPTION` (`:700`) — c'est **voulu** (un flux calendrier privé donne le contexte du RDV) et **protégé par le token secret 192 bits** (révocable). Standard d'un flux iCal privé (≈ « secret address » Google Calendar). Pas un défaut.

---

## Verdict

Le flux iCal public est **sain** : token **192 bits** crypto-aléatoire (non devinable) et **révocable**, scoping **strict** par artisan (pas de cross-tenant), **échappement iCal** complet (CRLF/`;`/`,`/`\\`) sur tous les champs libres (pas d'injection de propriété VEVENT), **rate-limit** 60/min/IP. **Aucun BLOCKER/HIGH** → **pas d'issue Linear**. L'exposition nom/téléphone client est **par conception** (flux privé sous token secret).
