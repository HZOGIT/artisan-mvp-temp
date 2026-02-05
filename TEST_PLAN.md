# 🧪 PLAN DE TEST COMPLET - ARTISAN MVP

**Date:** 2026-02-05
**Environnement:** Local Development (Sandbox)
**Navigateurs:** Chromium + Firefox
**Statut:** En cours d'exécution

---

## 📋 DONNÉES DE TEST

### Client 1 : Plombier Chauffagiste
- **Nom:** Jean Dupont
- **Email:** jean.dupont@plomberie.fr
- **Téléphone:** 06 12 34 56 78
- **Adresse:** 123 Rue de la Paix, 75000 Paris
- **Spécialité:** Plomberie & Chauffage

### Client 2 : Électricien Général
- **Nom:** Marie Martin
- **Email:** marie.martin@electricite.fr
- **Téléphone:** 06 98 76 54 32
- **Adresse:** 456 Avenue des Champs, 75008 Paris
- **Spécialité:** Électricité générale

### Client 3 : Entreprise de Construction
- **Nom:** BTP Solutions SARL
- **Email:** contact@btpsolutions.fr
- **Téléphone:** 01 45 67 89 00
- **Adresse:** 789 Boulevard de l'Industrie, 92100 Boulogne
- **Spécialité:** Construction générale

---

## 🧪 SCÉNARIOS DE TEST

### 1️⃣ AUTHENTIFICATION

#### Test 1.1 : Connexion avec identifiants valides
- **Données:** Email: `zoubej@gmail.com` / Mot de passe: `Zoubej@6691`
- **Étapes:**
  1. Accéder à la page de connexion
  2. Entrer les identifiants
  3. Cliquer sur "Se connecter"
- **Résultat attendu:** Redirection vers le tableau de bord
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:** 

#### Test 1.2 : Connexion avec identifiants invalides
- **Données:** Email: `test@test.com` / Mot de passe: `wrongpassword`
- **Étapes:**
  1. Accéder à la page de connexion
  2. Entrer les identifiants invalides
  3. Cliquer sur "Se connecter"
- **Résultat attendu:** Message d'erreur
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:**

#### Test 1.3 : Déconnexion
- **Étapes:**
  1. Être connecté
  2. Cliquer sur "Déconnexion"
- **Résultat attendu:** Redirection vers page de connexion
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:**

---

### 2️⃣ GESTION CLIENTS

#### Test 2.1 : Créer un nouveau client
- **Données:** Client 1 (Jean Dupont)
- **Étapes:**
  1. Accéder à "Nouveau Client"
  2. Remplir le formulaire
  3. Cliquer sur "Créer"
- **Résultat attendu:** Client créé, redirection vers liste
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:** Vérifier l'erreur "(void 0) is not a function"

#### Test 2.2 : Créer un deuxième client
- **Données:** Client 2 (Marie Martin)
- **Étapes:**
  1. Accéder à "Nouveau Client"
  2. Remplir le formulaire
  3. Cliquer sur "Créer"
- **Résultat attendu:** Client créé
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:**

#### Test 2.3 : Créer un troisième client
- **Données:** Client 3 (BTP Solutions)
- **Étapes:**
  1. Accéder à "Nouveau Client"
  2. Remplir le formulaire
  3. Cliquer sur "Créer"
- **Résultat attendu:** Client créé
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:**

#### Test 2.4 : Lister les clients
- **Étapes:**
  1. Accéder à "Clients"
  2. Vérifier que les 3 clients sont affichés
- **Résultat attendu:** 3 clients visibles dans la liste
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:**

#### Test 2.5 : Rechercher un client
- **Données:** Rechercher "Jean"
- **Étapes:**
  1. Accéder à "Clients"
  2. Utiliser la barre de recherche
  3. Taper "Jean"
- **Résultat attendu:** Jean Dupont s'affiche
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:**

#### Test 2.6 : Modifier un client
- **Données:** Modifier le téléphone de Jean Dupont
- **Étapes:**
  1. Accéder à la fiche client
  2. Modifier le téléphone
  3. Sauvegarder
- **Résultat attendu:** Modification sauvegardée
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:**

---

### 3️⃣ GESTION DEVIS

#### Test 3.1 : Créer un nouveau devis pour Client 1
- **Données:** 
  - Client: Jean Dupont
  - Articles: Tuyauterie (100€ HT), Main d'œuvre (50€ HT)
- **Étapes:**
  1. Accéder à "Nouveau Devis"
  2. Sélectionner le client
  3. Ajouter les articles
  4. Vérifier les calculs (HT, TVA, TTC)
  5. Créer le devis
- **Résultat attendu:** Devis créé avec calculs corrects
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:** Vérifier HT=150€, TVA=30€ (20%), TTC=180€

#### Test 3.2 : Créer un deuxième devis pour Client 2
- **Données:**
  - Client: Marie Martin
  - Articles: Installation électrique (200€ HT), Matériel (100€ HT)
- **Étapes:**
  1. Accéder à "Nouveau Devis"
  2. Sélectionner le client
  3. Ajouter les articles
  4. Créer le devis
- **Résultat attendu:** Devis créé
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:**

#### Test 3.3 : Lister les devis
- **Étapes:**
  1. Accéder à "Devis"
  2. Vérifier que les 2 devis sont affichés
- **Résultat attendu:** 2 devis visibles
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:**

#### Test 3.4 : Modifier un devis
- **Étapes:**
  1. Accéder à un devis
  2. Modifier une ligne
  3. Sauvegarder
- **Résultat attendu:** Modification sauvegardée, calculs mis à jour
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:**

---

### 4️⃣ GESTION FACTURES

#### Test 4.1 : Convertir un devis en facture
- **Étapes:**
  1. Accéder à un devis
  2. Cliquer sur "Convertir en facture"
  3. Vérifier les données
- **Résultat attendu:** Facture créée avec les mêmes données
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:**

#### Test 4.2 : Lister les factures
- **Étapes:**
  1. Accéder à "Factures"
  2. Vérifier que les factures sont affichées
- **Résultat attendu:** Factures visibles
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:**

#### Test 4.3 : Modifier une facture
- **Étapes:**
  1. Accéder à une facture
  2. Modifier une ligne
  3. Sauvegarder
- **Résultat attendu:** Modification sauvegardée
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:**

---

### 5️⃣ GESTION INTERVENTIONS

#### Test 5.1 : Créer une intervention
- **Données:**
  - Client: Jean Dupont
  - Date: Demain
  - Description: Réparation tuyauterie
- **Étapes:**
  1. Accéder à "Interventions"
  2. Cliquer sur "Nouvelle intervention"
  3. Remplir le formulaire
  4. Créer
- **Résultat attendu:** Intervention créée
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:**

#### Test 5.2 : Lister les interventions
- **Étapes:**
  1. Accéder à "Interventions"
  2. Vérifier que l'intervention est affichée
- **Résultat attendu:** Intervention visible
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:**

#### Test 5.3 : Voir le calendrier
- **Étapes:**
  1. Accéder à "Interventions"
  2. Cliquer sur "Calendrier"
- **Résultat attendu:** Calendrier affiche l'intervention
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:**

---

### 6️⃣ ARTICLES

#### Test 6.1 : Accéder à la bibliothèque d'articles
- **Étapes:**
  1. Accéder à "Articles"
  2. Vérifier que les articles sont affichés
- **Résultat attendu:** Articles visibles
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:** Vérifier qu'il y a 250+ articles

#### Test 6.2 : Rechercher un article
- **Données:** Rechercher "tuyau"
- **Étapes:**
  1. Accéder à "Articles"
  2. Utiliser la barre de recherche
  3. Taper "tuyau"
- **Résultat attendu:** Articles contenant "tuyau" s'affichent
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:**

---

### 7️⃣ PROFIL ARTISAN

#### Test 7.1 : Accéder au profil
- **Étapes:**
  1. Accéder à "Mon profil"
  2. Vérifier que les données sont affichées
- **Résultat attendu:** Profil visible
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:**

#### Test 7.2 : Modifier le profil
- **Étapes:**
  1. Accéder à "Mon profil"
  2. Modifier le nom de l'entreprise
  3. Sauvegarder
- **Résultat attendu:** Modification sauvegardée
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:**

---

### 8️⃣ TABLEAU DE BORD

#### Test 8.1 : Accéder au tableau de bord
- **Étapes:**
  1. Accéder à "Tableau de bord"
  2. Vérifier que les données sont affichées
- **Résultat attendu:** Tableau de bord visible
- **Résultat réel:** [ ] Passé [ ] Échoué [ ] Erreur
- **Notes:** Vérifier s'il y a un spinner infini

---

## 🌐 TESTS DE NAVIGATEUR

### Chromium
- [ ] Tous les tests passent
- [ ] Pas de console errors
- [ ] Performance acceptable

### Firefox
- [ ] Tous les tests passent
- [ ] Pas de console errors
- [ ] Pas de délai excessif sur les boutons

---

## 📊 RÉSUMÉ DES RÉSULTATS

| Catégorie | Tests | Passés | Échoués | Erreurs | Taux de Réussite |
|-----------|-------|--------|---------|---------|-----------------|
| Authentification | 3 | 0 | 0 | 0 | 0% |
| Clients | 6 | 0 | 0 | 0 | 0% |
| Devis | 4 | 0 | 0 | 0 | 0% |
| Factures | 3 | 0 | 0 | 0 | 0% |
| Interventions | 3 | 0 | 0 | 0 | 0% |
| Articles | 2 | 0 | 0 | 0 | 0% |
| Profil | 2 | 0 | 0 | 0 | 0% |
| Tableau de bord | 1 | 0 | 0 | 0 | 0% |
| **TOTAL** | **24** | **0** | **0** | **0** | **0%** |

---

## 🐛 BUGS IDENTIFIÉS

| ID | Priorité | Catégorie | Description | Statut |
|----|----------|-----------|-------------|--------|
| BUG-001 | 1 | Clients | "(void 0) is not a function" en formulaire | À tester |
| BUG-002 | 2 | Tableau de bord | Spinner infini | À tester |
| BUG-003 | 3 | Général | Délai Firefox | À tester |

---

## 📝 NOTES GÉNÉRALES

- Tests exécutés en local sur sandbox
- Pas de déploiement sur GitHub/Railway
- Tous les changements restent en local
- Rapport à mettre à jour au fur et à mesure des tests

---

**Fin du plan de test**
