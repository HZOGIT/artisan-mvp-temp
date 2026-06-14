# Audit — Géolocalisation des techniciens (RGPD / CNIL)

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

> Périmètre : `geolocalisationRouter` (`routers.ts:5262`), stockage des positions
> GPS (`positions_techniciens`, `historique_deplacements`). La géolocalisation
> de **salariés** est l'un des traitements les plus encadrés / sanctionnés par
> la CNIL.

---

## Ce qui fonctionne correctement

- **Pas d'IDOR** : tous les endpoints prenant un `technicienId`
  (`updatePosition`, `getLastPosition`, `getHistorique`,
  `getHistoriqueDeplacements`, `createHistoriqueDeplacement`) passent par
  `assertTechnicienOwner` (`routers.ts:5253`) qui vérifie
  `tech.artisanId === artisan.id`. C'est exactement le pattern que OPE-31
  recommande de généraliser — il est **correctement** appliqué ici. ✓
- `getPositions` / `getStatistiquesDeplacements` scopés sur `artisan.id`. ✓
- Le code porte un commentaire « SÉCURITÉ RGPD CRITIQUE » montrant la conscience
  du sujet côté accès. ✓

---

## 🟠 HIGH — Géolocalisation salariés sans garde-fous CNIL : conservation illimitée + aucune désactivation hors service

La protection est faite côté **accès** (ownership), mais **pas** côté **RGPD du
traitement**. Deux manquements concrets aux règles CNIL sur la géolocalisation
des employés (lignes directrices CNIL « géolocalisation des véhicules des
salariés » / délibération n° 2015-165) :

### 1. Conservation illimitée des positions GPS (pas de purge)

Aucune limite de rétention ni job de purge sur `positions_techniciens` ni
`historique_deplacements` :
- `grep` DELETE/purge/cleanup/retention sur ces tables → **0 résultat**.
- Le scheduler horaire (`server/_core/index.ts`) purge sessions/trials/emails
  mais **jamais** les positions GPS.
- Schéma `positions_techniciens` (`drizzle/schema.ts`) : un `timestamp` par
  position, **aucun TTL**, aucune suppression → les positions (lat/long, vitesse,
  batterie, cap) s'accumulent **indéfiniment**.

La CNIL fixe une conservation des données de géolocalisation des salariés à
**2 mois maximum** en usage courant (jusqu'à 1 an seulement pour un besoin précis
et justifié, ex. preuve d'intervention). Conserver l'historique de localisation
sans limite est non conforme.

### 2. Aucun mécanisme de désactivation / consentement / hors temps de travail

`updatePosition` (`routers.ts:5283`) enregistre la position **dès qu'il est
appelé**, sans aucune condition :
- `grep` `trackingEnabled` / `suiviActif` / `consentement` / `optOut` /
  `horaires` / désactivation → **0 résultat** (rien sur le technicien ni en
  paramètres).
- Aucun gating sur les **heures de travail** : le système n'empêche pas
  l'enregistrement de positions pendant les pauses ou **hors service**.

La CNIL impose que le salarié puisse **désactiver la géolocalisation hors temps
de travail** (et pendant les pauses), et interdit le suivi permanent. En l'état,
si l'app envoie des positions en continu, elle trace l'employé sans interruption
possible — l'un des points les plus sanctionnés par la CNIL.

### Impact

- Risque de sanction CNIL (la surveillance permanente des salariés et la
  conservation excessive sont des griefs récurrents et lourdement sanctionnés).
- Le DPO/employeur ne peut pas tenir ses obligations (information, durée de
  conservation affichée, droit d'opposition partiel).

### Sévérité

**HIGH** au lancement, **BLOCKER de fait dès que la fonctionnalité est activée
pour tracer de vrais salariés.**

### Fix proposé

1. **Rétention** : job de purge quotidien supprimant `positions_techniciens` et
   `historique_deplacements` au-delà de **2 mois** (paramétrable, plafonné selon
   la finalité). À ajouter au scheduler existant.
   ```sql
   DELETE FROM positions_techniciens WHERE timestamp < NOW() - INTERVAL 60 DAY;
   ```
2. **Désactivation / temps de travail** : ajouter un flag `suiviActif` sur le
   technicien (ou un statut « en service / hors service »), et **refuser**
   `updatePosition` quand le suivi est désactivé / hors plage horaire. Exposer au
   technicien un interrupteur de partage de position.
3. **Information** : mention dédiée dans la politique de confidentialité (finalité,
   durée, destinataires) + information des salariés.
4. **Minimisation** : réévaluer la collecte du niveau de `batterie` (non
   nécessaire à la finalité de suivi d'intervention).

### Estimation

~1,5 j — job de purge + flag suiviActif + garde dans `updatePosition` + mention RGPD.

---

## Estimation totale

- HIGH (rétention illimitée + absence de désactivation hors service) : ~1,5 j
