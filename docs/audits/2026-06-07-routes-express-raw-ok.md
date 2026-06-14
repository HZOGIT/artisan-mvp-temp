# Audit — Routes Express brutes (PDF / exports / paiement / debug) — RAS bloquant

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : toutes les routes HTTP brutes `app.get/post` de
> `server/_core/index.ts` (hors tRPC) — PDF, exports comptables, statut paiement,
> endpoints voice. **Aucun BLOCKER/HIGH** → pas d'issue Linear. Un point MEDIUM
> documenté.

---

## Ce qui fonctionne correctement — l'ownership est vérifié partout

Contrairement aux routeurs tRPC (cf. le pattern IDOR systémique d'OPE-47), **les
routes Express brutes contrôlent bien l'appartenance** :

### Routes portail (publiques, token-gated)
- `/api/portail/:token/devis/:id/pdf` (`index.ts:394`) : `devisData.clientId !==
  access.clientId` → 404. ✓
- `/api/portail/:token/factures/:id/pdf` (`:420`) : `facture.clientId !==
  access.clientId` → 404. ✓
- `/api/paiement/status/:factureId` (`:880`) : token portail + `facture.clientId
  !== access.clientId` → 404. ✓
- Le helper `getClientPortalAccessByToken` filtre `isActive` + `expiresAt` (déjà
  vérifié dans l'audit portail). ✓

### Routes authentifiées (cookie JWT)
- `/api/contrats/:id/pdf` (`:447`) : `contrat.artisanId !== artisan.id` → 403. ✓
- `/api/commandes-fournisseurs/:id/pdf` (`:480`) : `commande.artisanId !==
  artisan.id` → 403. ✓
- `/api/comptabilite/facturx/:factureId` (`:645`) & `facturx-xml/:factureId`
  (`:673`) : `facture.artisanId !== artisan.id` → 404. ✓ (via `authFromCookie`)
- FEC / export-csv / export-*-lot : `authFromCookie` + requêtes scopées
  `artisanId` (déjà couvert par l'audit FEC OPE-33). ✓
- Upload logo / voice token / voice tool / voice persist : auth + scope artisan
  (déjà couverts). ✓

> Constat utile : le **défaut d'isolation multi-tenant est localisé aux routeurs
> tRPC** (OPE-9/10/30/31/38/45/46/47), **pas** à la couche HTTP brute. Cela
> resserre le périmètre du chantier de remédiation IDOR.

---

## 🟡 MEDIUM (documenté, pas d'issue) — `/api/voice/debug` : sink de logs non authentifié

`/api/voice/debug` (`index.ts:1084`) accepte des `events`/`msg` **sans
authentification ni rate limit** et les écrit dans les logs serveur :

```typescript
app.post('/api/voice/debug', (req, res) => {
  const { events } = req.body || {};
  if (Array.isArray(events)) for (const e of events)
    console.log(`[VoiceDebug] ${typeof e === 'string' ? e : JSON.stringify(e)}`);
  else if (req.body?.msg) console.log(`[VoiceDebug] ${req.body.msg}`);
  res.json({ ok: true });
});
```

Risques (faibles) :
- **Log flooding / DoS de logs** : endpoint public non limité → un attaquant peut
  noyer les logs (coût, saturation disque, masquage des vraies erreurs).
- **Log forging / injection** : contenu attaquant-contrôlé (avec retours ligne)
  écrit tel quel → faux événements de log, parseurs/alerting trompés.

Pas de fuite de données ni d'exécution. **En-dessous du seuil HIGH.**

### Fix suggéré

Exiger l'auth (cookie) + un rate limit, borner la taille, et/ou désactiver
l'endpoint en production (il n'est utile qu'au debug du mode vocal).

---

## Conclusion

La couche HTTP brute (PDF, exports, paiement, voice) est **correctement
sécurisée** (ownership vérifié systématiquement). Aucun BLOCKER/HIGH. Seul
`/api/voice/debug` mérite un durcissement mineur (auth + rate limit / retrait en
prod).
