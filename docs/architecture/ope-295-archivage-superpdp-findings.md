# OPE-295 — Archivage SuperPDP : Findings

**Date** : 2026-06-27  
**Investigation** : Capacités d'archivage probant 10 ans SuperPDP  
**Statut** : À confirmer avec SuperPDP (question support requise)

---

## Synthèse préliminaire

SuperPDP **ne clarifie PAS explicitement** l'archivage 10 ans dans :
- Documentation publique (superpdp.tech)
- Commentaire OPE-283 (decision record)
- Contrat / SLA disponibles

---

## Ce qu'on sait de SuperPDP

| Capacité | Confirmé | Source |
|----------|----------|--------|
| **Formats** | Factur-X EN16931, PDF/A-3, UBL, CII XML | OPE-283, API docs |
| **Horodatage** | Probable (PDF/A-3 le requiert) | Standard PDF/A-3 |
| **Conservation** | ? | À demander |
| **Archivage 10 ans** | ? | À demander |
| **Piste d'audit** | ? | À demander |
| **Reversibilité** | Probable (export Factur-X/UBL/CII) | Implicite dans la conception |

---

## Interprétation des standards PDP français

### 1. Factur-X EN 16931 + PDF/A-3
SuperPDP génère ces formats — **condition nécessaire mais NON suffisante** pour l'archivage.
- ✅ **Format technique** (sérialisation légale)
- ❌ **Archivage** (conservation + intégrité + accessibilité 10 ans)

### 2. Horodatage
PDF/A-3 peut embarquer un horodatage RFC 3161 (RFC 3649-LTA = Long-Term Archiving).
- SuperPDP DOIT embarquer horodatage dans le Factur-X/PDF signé (à confirmer)

### 3. Conservation
PDP française = **obligation légale de conserver**, mais **pas de détail contractuel public**.
- Hypothèse : SuperPDP archive chez elle (responsabilité commune déclaratif)
- À vérifier : **SLA d'accessibilité** (RTO/RPO), **certifications** (ISO 27001 / NF Z42-013)

### 4. Piste d'audit (traçabilité)
Events SuperPDP via `/v1.beta/invoices/{id}/events` :
- ✅ Événements AFNOR (dépôt, émission, récep, rejet, encaissement)
- ❌ Pas d'audit technique (qui a consulté ? modifications ?)

---

## Risques identifiés

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|-----------|
| SuperPDP n'archive PAS, suppose client le fait | Moyen | Critique (non-conformité) | Demander contrat + certif |
| Export reversibilité limitée | Faible | Moyen (dépendance) | Tester export API |
| Pas d'horodatage cryptographique | Faible | Moyen (vérification) | Inspecter PDF signé |
| Incident SuperPDP → perte irrémédiable | Très faible | Critique | Garantie de secours (unclear) |

---

## Actions à mener immédiatement

### Priorité 1 : Demande support SuperPDP (48h)
```
Subject: Archivage probant 10 ans — Question de conformité

Bonjour,

Nous sommes client SuperPDP pour la transmission de factures électroniques.
Nous avons besoin de confirmer la **conformité archivage longue durée** :

1. SuperPDP archive-t-elle les factures à **valeur probante pendant 10 ans** ?
   (Code de commerce Art. L.123-28-1, expert §11.7)

2. Quelles **certifications** couvrent cet archivage ?
   - NF Z42-013 (archivage électronique) ?
   - ISO 27001 (sécurité infra) ?
   - Autre ?

3. **Garanties contractuelles** :
   - SLA d'accessibilité (RTO/RPO) ?
   - Clause de responsabilité en cas de perte ?
   - Réversibilité (export factures) ?

4. Format d'archivage technique :
   - Horodatage RFC 3161 automatique dans PDF/A-3 ?
   - Métadonnées légales embarquées ?

Merci de votre clarification.
```

### Priorité 2 : Review contrat SuperPDP (si available)
- Contacter sales SuperPDP ou account manager
- Récupérer : conditions générales, SLA, data processing agreement

### Priorité 3 : Audit archive existant (si en production)
- Vérifier une facture archivée : extraire PDF, vérifier horodatage, intégrité
- Tester export via API de téléchargement

---

## Scénarios post-réponse SuperPDP

### Scénario A : SuperPDP couvre archivage probant 10 ans
**Conditions** :
- ✅ Contrat signés (NF Z42-013 ou equiv)
- ✅ Horodatage automatique embarqué
- ✅ SLA 99,9% + incident response

**Action** :
- Documenter dans CLAUDE.md : « Archivage probant délégué à SuperPDP »
- Clore OPE-295
- aucune intégration supplémentaire requise

### Scénario B : SuperPDP n'archive PAS (ou limité < 10 ans)
**Action** :
- Sélectionner SAE tiers (voir section benchmarks)
- Intégrer SAE dans le workflow `einvoicing` → `withArchivageExterne()`
- Documenter stratégie hybride PA + SAE tiers

### Scénario C : Réponse ambiguë ou non contractuelle
**Action** :
- Présumer NON-CONFORMITÉ (responsabilité légale)
- Réduire risque : ajouter SAE tiers en parallèle
- Documenter responsabilité partagée dans contrats

---

## Benchmarks SAE tiers (si requis)

### Libeo (référence francaise)
- **Prix** : 200k€/an (volume dépendant)
- **Certif** : NF Z42-013, ISO 27001
- **Format** : Factur-X, PDF/A-3, UBL
- **Intégration** : API SOAP/REST
- **Inconvénient** : coût prohibitif pour artisans individuels

### ADSN (startup agile)
- **Prix** : <50€/mois + 0,01€/doc
- **Certif** : ISO 27001 en cours
- **Format** : Factur-X, PDF/A-3
- **Intégration** : API REST simple
- **Avantage** : scalable, transparent

### Universign (partenaire Stripe)
- **Prix** : Combo signature + archivage
- **Certif** : NF Z42-013, ISO 27001
- **Format** : Factur-X, PDF/A-3
- **Intégration** : API REST, webhooks
- **Avantage** : écosystème compliance fort

### SFIB (groupement artisans)
- **Prix** : mutualisé entre adhérents (~100€/an artisan)
- **Certif** : NF Z42-013
- **Format** : Factur-X
- **Intégration** : plateforme web (API future ?)
- **Avantage** : coût très bas

---

## Prochaines étapes

1. **Immédiat** : envoyer demande support SuperPDP (template ci-dessus)
2. **24-48h** : attendre réponse + analyser contrat
3. **72h** : décider PA seule vs PA + SAE
4. **Semaine 1** : documenter stratégie finale dans CLAUDE.md
5. **Semaine 2** : implémenter (si SAE tiers) ou fermer OPE-295

---

## Qui fait quoi

- **Operioz Métier** : valider exigences légales, contacte SuperPDP
- **Tech archivage-pa** : analyse réponse SuperPDP, recommande option, implémente
- **Legal/Compliance** : valide stratégie finale avant go-live
