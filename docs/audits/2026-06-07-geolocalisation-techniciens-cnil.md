# Audit — Géolocalisation des techniciens (conformité CNIL/RGPD)

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : capture et conservation de la **position GPS des techniciens
> (salariés)** — `geolocalisationRouter` (`routers.ts:5262`), `startIntervention`
> (`routers.ts:4541`), tables `positions_techniciens` / `interventions_mobile`.
> Distinct d'OPE-26 (effacement des données **clients** + politique mensongère) :
> ici il s'agit du **traitement de géolocalisation des salariés**, soumis à des
> règles CNIL spécifiques.

---

## Ce qui fonctionne correctement

- **Isolation multi-tenant OK** : tout le `geolocalisationRouter` passe par
  `assertTechnicienOwner` / `getArtisanByUserId` → pas d'IDOR.
- La capture GPS à l'arrivée (`InterventionsMobile.tsx:62`) déclenche bien le
  **prompt navigateur** `navigator.geolocation.getCurrentPosition` (consentement
  OS au niveau de l'appareil), et **dégrade proprement** si refusé
  (`startIntervention` sans lat/long).

---

## 🟠 HIGH — Géolocalisation des salariés sans base légale opposable : pas de consentement/information, pas de limite de conservation, absente de la politique de confidentialité

### Le traitement existe et capture réellement de la donnée

À chaque démarrage d'intervention, la **position GPS du technicien** est
enregistrée :

```typescript
// routers.ts:4565 (startIntervention) — arrivée sur site
mobileData = await db.createInterventionMobile({
  interventionId, artisanId,
  heureArrivee: new Date(),
  latitude:  input.latitude?.toString(),   // ← position GPS du salarié
  longitude: input.longitude?.toString(),
});
```

→ stockée dans `interventions_mobile` (`schema.ts:636`, `latitude`/`longitude` +
`heureArrivee`/`heureDepart`). Le routeur `geolocalisationRouter` expose en plus
un suivi temps réel (`positions_techniciens`, `schema.ts:794` : lat/long,
**vitesse, cap, batterie**, `enDeplacement`, timestamp) et une page carte live
artisan (`Geolocalisation.tsx`, refresh 30 s).

La donnée de localisation d'un salarié est une donnée à caractère personnel dont
le traitement par l'employeur est **strictement encadré (CNIL / RGPD)**. Trois
manquements :

### 1. Aucun mécanisme de consentement / d'activation côté salarié

`grep -i "consentement|suiviGps|geolocActif|trackingConsent"` sur
`schema.ts` + `server/` + `client/src` → **0 résultat**. La table `techniciens`
(`schema.ts:716`) n'a **aucun champ** d'activation/consentement géoloc. Le suivi
est **entièrement piloté par l'artisan** ; le salarié n'a **aucun moyen de
désactiver** la géoloc (notamment hors temps de travail / pendant les pauses, ce
que la CNIL exige). Le prompt navigateur OS ne vaut pas information RGPD ni base
légale du traitement RH.

### 2. Aucune limite de conservation (rétention infinie)

`grep -i "purge|retention|conservation|deleteOldPositions"` côté positions →
**0 résultat**. Ni `positions_techniciens` ni `interventions_mobile.latitude/
longitude` ne sont jamais purgées → **conservation illimitée** des traces de
localisation. La CNIL recommande une conservation des données de géolocalisation
**limitée (de l'ordre de 2 mois)**, au-delà uniquement pour une finalité
justifiée. Ici, l'historique des positions s'accumule indéfiniment.

### 3. Absente de la politique de confidentialité

`grep -i "géoloc|gps|localisation|salarié|technicien"` sur
`client/src/pages/legal/Confidentialite.tsx` → **0 mention de la géolocalisation**.
Le traitement n'est ni décrit, ni sa finalité, ni sa durée de conservation
(manquement de transparence Art. 13 RGPD). Aggrave OPE-26 (politique de
confidentialité déjà qualifiée d'incomplète/mensongère).

### Impact

- **Exposition légale de l'artisan ET de la plateforme** (Operioz fournit l'outil
  de traitement) : la géolocalisation des salariés figure parmi les traitements
  « à risque » (analyse d'impact AIPD attendue, information préalable des salariés
  et du CSE, proportionnalité, durée de conservation limitée). En l'état, l'outil
  **n'offre aucun garde-fou** permettant à l'artisan d'être conforme.
- Plainte salarié / contrôle CNIL → **mise en demeure voire sanction** (la
  géolocalisation abusive de salariés est un motif de sanction CNIL récurrent).

### Fix proposé

1. **Consentement/activation explicite** : champ `suiviGeolocActif` +
   `consentementGeolocAt` sur `techniciens` ; capture GPS conditionnée à
   l'activation ; possibilité pour le salarié de désactiver (au moins hors temps
   de travail).
2. **Rétention** : job de purge planifié `DELETE FROM positions_techniciens` (et
   anonymisation/effacement des lat/long de `interventions_mobile`) au-delà de la
   durée retenue (≈ 2 mois par défaut, paramétrable).
3. **Transparence** : section dédiée « Géolocalisation des intervenants » dans la
   politique de confidentialité (finalité, base légale, durée, droits) +
   information du salarié à l'activation.
4. **Doc** : note d'aide rappelant à l'artisan ses obligations (information
   préalable des salariés / CSE, AIPD).

### Estimation

~1 j — champs consentement + garde sur la capture + job de purte + section
politique de confidentialité + test.

---

## 🟡 MEDIUM (documenté, pas d'issue séparée) — suivi temps réel « mort » côté capture

`geolocalisation.updatePosition` (`routers.ts:5263`, écrit `positions_techniciens`
via `updatePositionTechnicien`, `db.ts:1973`) **n'a aucun appelant client**
(`grep updatePosition client/src` → 0). La page carte live (`Geolocalisation.tsx`,
`getPositions`) n'est donc **jamais alimentée** par ce canal → carte vide. Seules
les positions d'arrivée d'intervention (`interventions_mobile`) sont réellement
écrites. À traiter avec l'issue HIGH (soit câbler proprement avec consentement,
soit retirer la feature live pour réduire la surface légale).

---

## Estimation totale

- HIGH (conformité géoloc salariés : consentement + rétention + transparence) : ~1 j
- MEDIUM (suivi temps réel non câblé) : inclus / à arbitrer (câbler vs retirer)
