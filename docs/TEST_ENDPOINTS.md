# Endpoints de Test - Artisan MVP

## ⚠️ IMPORTANT

Ces endpoints sont **UNIQUEMENT** disponibles en mode développement (`NODE_ENV === "development"`).

Ils permettent de forcer la connexion avec un utilisateur de test sans passer par OAuth.

**NE JAMAIS** utiliser en production !

---

## Endpoints disponibles

### 1. Artisan A - biopp2003@yahoo.fr (Marseille)

```
GET /api/test/login-biopp2003
```

**Clients :**
- Robert Alain
- Rousseau Claire

**Entreprise :** Électricité Blanc & Associés

---

### 2. Artisan B - doudihab@gmail.com (Lyon)

```
GET /api/test/login-doudihab
```

**Clients :**
- Lefebvre Marie
- Bernard Pierre

**Entreprise :** Électricité Dubois SARL

---

### 3. Artisan C - zouiten@biopp.fr (Paris)

```
GET /api/test/login-zouiten
```

**Clients :**
- Dupont Jean
- Martin Sophie
- Durand Paul

**Entreprise :** BioApp Solutions

---

## Comment utiliser

1. Cliquez sur l'un des liens ci-dessus
2. Vous serez automatiquement connecté avec l'utilisateur correspondant
3. Vous serez redirigé vers la page d'accueil
4. Allez à la page "Clients" pour voir les clients de cet artisan

---

## Tester l'isolation multi-tenant

1. Connectez-vous avec Artisan A (`/api/test/login-biopp2003`)
2. Vérifiez que vous voyez 2 clients (Robert Alain, Rousseau Claire)
3. Connectez-vous avec Artisan B (`/api/test/login-doudihab`)
4. Vérifiez que vous voyez 2 clients DIFFÉRENTS (Lefebvre Marie, Bernard Pierre)
5. Connectez-vous avec Artisan C (`/api/test/login-zouiten`)
6. Vérifiez que vous voyez 3 clients DIFFÉRENTS (Dupont Jean, Martin Sophie, Durand Paul)

**Résultat attendu :** Chaque artisan ne voit QUE ses propres clients ✅

---

## Sécurité

### Contrainte UNIQUE sur l'email

Une contrainte `UNIQUE` a été ajoutée à la colonne `email` de la table `users` pour éviter les doublons.

```sql
ALTER TABLE users ADD CONSTRAINT unique_email UNIQUE (email);
```

Cela garantit qu'il ne peut jamais y avoir 2 utilisateurs avec le même email.

---

## Amélioration du code OAuth

Le code OAuth a été amélioré pour :

1. **Chercher l'utilisateur par email** avant de créer un doublon
2. **Mettre à jour l'openId** si l'utilisateur existe déjà
3. **Éviter les doublons** lors de la reconnexion

---

## Notes de développement

- Les endpoints de test utilisent un helper `createTestSession()` pour éviter la duplication de code
- Les sessions de test ont une durée de vie d'1 an (même que les sessions OAuth normales)
- Les cookies de session sont sécurisés (httpOnly, sameSite=none, secure)
- Les endpoints retournent une erreur 404 si l'utilisateur n'existe pas
