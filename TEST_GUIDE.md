# 🧪 Guide de Test - Flux d'Authentification Complet

## 📋 Vue d'ensemble

Ce guide vous aide à tester le système d'authentification personnalisé avec protection des routes.

---

## ✅ Tests à Effectuer

### 1️⃣ Test de Création de Compte (Sign Up)

**Étapes :**
1. Accédez à `/signup`
2. Remplissez le formulaire :
   - Email : `nouveau@test.com`
   - Mot de passe : `TestPassword123`
   - Nom : `Test User`
3. Cliquez sur "S'inscrire"

**Résultats attendus :**
- ✅ Notification de succès "Compte créé avec succès"
- ✅ Redirection automatique vers `/signin`

---

### 2️⃣ Test de Connexion (Sign In)

**Étapes :**
1. Accédez à `/signin`
2. Remplissez le formulaire :
   - Email : `nouveau@test.com`
   - Mot de passe : `TestPassword123`
3. Cliquez sur "Se connecter"

**Résultats attendus :**
- ✅ Notification de succès "Connexion réussie"
- ✅ Redirection automatique vers `/dashboard`
- ✅ Affichage du dashboard avec la sidebar

---

### 3️⃣ Test de Protection des Routes

**Étapes :**
1. Ouvrez une nouvelle fenêtre de navigateur
2. Accédez directement à `/dashboard` (sans être connecté)

**Résultats attendus :**
- ✅ Redirection automatique vers `/signin`

---

### 4️⃣ Test de Redirection des Routes Publiques

**Étapes :**
1. Connectez-vous
2. Accédez directement à `/signin`

**Résultats attendus :**
- ✅ Redirection automatique vers `/dashboard`

---

### 5️⃣ Test de Déconnexion (Sign Out)

**Étapes :**
1. Connectez-vous
2. Cliquez sur l'avatar utilisateur en bas de la sidebar
3. Cliquez sur "Sign out"

**Résultats attendus :**
- ✅ Redirection vers `/` (page d'accueil)
- ✅ Impossible d'accéder à `/dashboard` sans se reconnecter

---

## 📊 Résumé des Tests

| Test | Statut | Notes |
|------|--------|-------|
| 1. Création de compte | ⏳ À tester | |
| 2. Connexion | ⏳ À tester | |
| 3. Protection des routes | ⏳ À tester | |
| 4. Redirection des routes publiques | ⏳ À tester | |
| 5. Déconnexion | ⏳ À tester | |

---

## 🚀 Prochaines Étapes

Une fois tous les tests passés :

1. **Redéployer sur Railway** - `git push` pour mettre à jour la production
2. **Continuer Sprint 3** :
   - Import des 250 articles Excel
   - Génération PDF des devis
   - Upload du logo artisan
