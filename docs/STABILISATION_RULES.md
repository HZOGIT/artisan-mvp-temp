# 📋 RÈGLES DE STABILISATION - PHASE CRITIQUE

**Date de démarrage :** 2026-02-04
**Checkpoint de référence :** manus-webdev://c18c0991 (fcf1df84)
**État :** ✅ 7 Fonctionnalités MVP Opérationnelles

---

## ✅ CE QUI FONCTIONNE (NE PAS TOUCHER)

1. ✅ Authentification (login direct email/password)
2. ✅ Profil Artisan (CRUD)
3. ✅ Gestion Clients (création, liste, recherche)
4. ✅ Gestion Devis (création, lignes, calculs HT/TVA/TTC)
5. ✅ Factures (conversion, liste)
6. ✅ Interventions (création, calendrier)
7. ✅ Articles (bibliothèque 250+ articles)

---

## 🔴 LES 5 RÈGLES OBLIGATOIRES

### Règle 1 : Ne JAMAIS supprimer sans validation
- Toute suppression de fichier, fonction ou fonctionnalité = validation écrite préalable
- Demander confirmation avant d'exécuter

### Règle 2 : Tester LOCALEMENT avant déploiement
- Ouvrir l'application en local
- Cliquer sur CHAQUE bouton modifié
- Vérifier console (F12) pour erreurs
- SEULEMENT ENSUITE : déployer

### Règle 3 : Un problème = Une correction
- Ne pas corriger 10 choses à la fois
- Bug identifié → correction → test → déploiement

### Règle 4 : Checkpoint avant modification majeure
- Créer checkpoint AVANT toute modification importante
- Permet rollback rapide si problème

### Règle 5 : Demander en cas de doute
- Si tu n'es pas sûr → demande AVANT d'agir
- Mieux vaut demander que casser l'app

---

## 🐛 BUGS CONNUS (ORDRE DE PRIORITÉ)

| Priorité | Bug | Description | État |
|----------|-----|-------------|------|
| 1 | "(void 0) is not a function" | Apparaît en bas du formulaire "Nouveau client" | À diagnostiquer |
| 2 | Tableau de bord | Affiche un spinner de chargement infini | À diagnostiquer |
| 3 | Délai Firefox | Certains boutons mettent 1-2s de plus sur Firefox | À diagnostiquer |

---

## ❌ CE QU'IL NE FAUT PAS FAIRE

- ❌ Refonte du code
- ❌ Suppression de pages
- ❌ Changement d'architecture
- ❌ Ajout de nouvelles fonctionnalités
- ❌ Modifications non validées

---

## 📊 PHASE ACTUELLE : STABILISATION

**Objectif :** Ne rien casser. Corriger uniquement les bugs critiques.

**Étapes :**
1. ⏳ Attendre plan de test complet (3 clients réalistes)
2. 🧪 Exécuter plan de test
3. 📝 Générer rapport de test détaillé
4. 🔧 Corriger bugs critiques identifiés
5. ✅ Valider et déployer

---

## 📅 PLAN GLOBAL

| Phase | Objectif | Durée | État |
|-------|----------|-------|------|
| 1 (actuelle) | Stabilisation + Tests complets | - | 🔄 En cours |
| 2 | Correction bugs mineurs | - | ⏳ À venir |
| 3 | Amélioration UX | - | ⏳ À venir |
| 4 | Ajout fonctionnalités secondaires | - | ⏳ À venir |

---

## 🎯 PROCHAINE ÉTAPE

**⏸️ EN ATTENTE DU PLAN DE TEST COMPLET**

Ne rien faire jusqu'à réception du plan de test avec 3 clients réalistes.
