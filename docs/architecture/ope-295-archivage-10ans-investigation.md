# OPE-295 — Investigation : Archivage 10 ans probant

> **⚠️ TRANCHÉ — OUI (OPE-899, 2026-06-30). SuperPDP archive 10 ans. SAE tiers non requis. Investigation clôturée. → Voir `ope-295-archivage-superpdp-findings.md`.**

**Date** : 2026-06-27  
**Status** : Clôturé  
**Issue** : [OPE-295](https://linear.app/operioz/issue/OPE-295)

---

## Contexte réglementaire

**Obligation légale** : Article L. 123-28-1 du Code de commerce (expert §11.7)
- Toute facture électronique doit être **archivée à valeur probante pendant 10 ans**.
- Couverture requise : **Factur-X + PDF/A-3 + horodatage** + **piste d'audit** + **reversibilité**.

---

## État actuel : SuperPDP

| Critère | État | Source |
|---------|------|--------|
| **PA choisie** | SuperPDP (OPE-283 Done) | `superpdp-pa-adapter.ts`, `superpdp.tech` |
| **Formats supportés** | Factur-X (PDF/A-3), UBL, CII | OPE-283 commentaire |
| **Horodatage** | À vérifier | |
| **Archivage 10 ans** | **À CONFIRMER** | OPE-283 RFP question non répondueà |
| **Reversibilité/export** | À vérifier | |

---

## Plan d'investigation

### Phase 1 : Vérifier contrat SuperPDP (48h)
- [ ] Récupérer contrat / offre SuperPDP → conditions d'archivage
- [ ] Consulter documentation SuperPDP (API docs, FAQ, SLA)
- [ ] Demander clarification support SuperPDP : « Les factures sont-elles archivées à valeur probante 10 ans ? »

### Phase 2 : Capacités réelles (si non inclus dans SuperPDP)
- [ ] Benchmark SAE tiers : prix, intégration, certifications
  - **Libeo** (historique, certifié NF Z42-013, ~200k€/an)
  - **Universign** (signature + archivage combo, ~500 factures/mois)
  - **ADSN** (startup, API, <50€/mois)
  - **Groupement SFIB** (archivage collectif artisans)
- [ ] Évaluer coûts / risques de dépendance (lock-in)

### Phase 3 : Décision & implémentation
- [ ] Documenter : PA ou SAE retenu ?
- [ ] Si SAE : intégrer l'API dans `einvoicing.module.ts`
- [ ] Tests : vérifier ArchiveStrategy + conditions de reversibilité
- [ ] Documenter stratégie dans CLAUDE.md

---

## Critères de décision

| Scénario | Condition | Action |
|----------|-----------|--------|
| **SuperPDP inclut archivage probant 10 ans** | Contrat confirm + SLA 99,9% | Noop, documentation seule |
| **SuperPDP n'inclut PAS, mais propose addon** | Addon coûteux ou limité | Évaluer vs SAE tiers |
| **SuperPDP n'offre rien** | Néant | Intégrer SAE tiers |

---

## Notes / prochaines étapes

- **Deadline réglementaire** : aucune date limite donnée, mais archivage est **obligatoire avant go-live**.
- **Reversibilité** : s'assurer que données restent exploitables en cas de changement de PA.
- **Audit de conformité** : demander audit annuel (ISO 27001 / NF Z42-013) si applicable.
