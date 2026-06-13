# Guide d'Installation Locale - Artisan MVP

Ce guide vous permet d'installer et de configurer le projet **Artisan MVP** sur votre machine locale pour tester toutes les fonctionnalités.

---

## 📋 Prérequis

Avant de commencer, assurez-vous d'avoir installé :

- **Node.js** 18+ ([https://nodejs.org](https://nodejs.org))
- **pnpm** 8+ ([https://pnpm.io](https://pnpm.io)) - Gestionnaire de paquets
- **MySQL** 8+ ou **MariaDB** 10.5+ ([https://www.mysql.com](https://www.mysql.com))
- **Git** ([https://git-scm.com](https://git-scm.com))

### Vérifier les versions installées

```bash
node --version      # Doit être >= 18.0.0
pnpm --version      # Doit être >= 8.0.0
mysql --version     # Doit être >= 8.0.0
git --version       # Doit être >= 2.0.0
```

### Installer pnpm (si nécessaire)

```bash
npm install -g pnpm
```

---

## 🚀 Installation du Projet

### 1. Décompresser le fichier

```bash
# Décompresser le fichier tar.gz
tar -xzf artisan-mvp-temp.tar.gz

# Accéder au répertoire du projet
cd artisan-mvp-temp
```

### 2. Installer les dépendances

```bash
# Installer toutes les dépendances du projet
pnpm install

# Cela peut prendre 2-5 minutes selon votre connexion internet
```

### 3. Configurer la base de données

#### Créer la base de données MySQL

```bash
# Connectez-vous à MySQL
mysql -u root -p

# Dans le shell MySQL, exécutez :
CREATE DATABASE artisan_mvp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'artisan_user'@'localhost' IDENTIFIED BY 'artisan_password_secure';
GRANT ALL PRIVILEGES ON artisan_mvp.* TO 'artisan_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

#### Ou utiliser un fichier de configuration

Si vous préférez utiliser Docker pour MySQL :

```bash
# Créer et lancer un conteneur MySQL
docker run --name artisan-mysql \
  -e MYSQL_ROOT_PASSWORD=root_password \
  -e MYSQL_DATABASE=artisan_mvp \
  -e MYSQL_USER=artisan_user \
  -e MYSQL_PASSWORD=artisan_password_secure \
  -p 3306:3306 \
  -d mysql:8.0
```

### 4. Configurer les variables d'environnement

#### Créer le fichier `.env.local`

```bash
# Copier le fichier d'exemple (s'il existe)
cp .env.example .env.local

# Ou créer un nouveau fichier
touch .env.local
```

#### Ajouter les variables d'environnement

Ouvrez `.env.local` et ajoutez :

```env
# ============================================================================
# BASE DE DONNÉES
# ============================================================================
DATABASE_URL="mysql://artisan_user:artisan_password_secure@localhost:3306/artisan_mvp"

# ============================================================================
# AUTHENTIFICATION
# ============================================================================
JWT_SECRET="your_jwt_secret_key_here_minimum_32_characters_long"

# ============================================================================
# OAUTH (Manus)
# ============================================================================
# Ces valeurs sont optionnelles pour le développement local
# Vous pouvez les obtenir depuis https://manus.im
VITE_APP_ID="your_app_id_here"
OAUTH_SERVER_URL="https://api.manus.im"
VITE_OAUTH_PORTAL_URL="https://manus.im"

# ============================================================================
# INFORMATIONS PROPRIÉTAIRE
# ============================================================================
OWNER_NAME="Votre Nom"
OWNER_OPEN_ID="your_open_id_here"

# ============================================================================
# STRIPE (Paiements en ligne - Optionnel)
# ============================================================================
STRIPE_SECRET_KEY="sk_test_your_stripe_key_here"
VITE_STRIPE_PUBLISHABLE_KEY="pk_test_your_stripe_key_here"
STRIPE_WEBHOOK_SECRET="whsec_your_webhook_secret_here"

# ============================================================================
# LLM (Intelligence Artificielle - Optionnel)
# ============================================================================
BUILT_IN_FORGE_API_URL="https://api.manus.im"
BUILT_IN_FORGE_API_KEY="your_forge_api_key_here"
VITE_FRONTEND_FORGE_API_URL="https://api.manus.im"
VITE_FRONTEND_FORGE_API_KEY="your_frontend_forge_api_key_here"

# ============================================================================
# ANALYTICS (Optionnel)
# ============================================================================
VITE_ANALYTICS_ENDPOINT="https://analytics.example.com"
VITE_ANALYTICS_WEBSITE_ID="your_website_id_here"

# ============================================================================
# TITRE ET LOGO DE L'APPLICATION
# ============================================================================
VITE_APP_TITLE="Artisan MVP"
VITE_APP_LOGO="/logo.svg"
```

### 5. Exécuter les migrations de base de données

```bash
# Générer et exécuter les migrations
pnpm db:push

# Cela créera toutes les tables et structures de base de données
```

### 6. Générer les types TypeScript

```bash
# Générer les types depuis le schéma Drizzle
pnpm db:generate
```

---

## 🏃 Lancer le Projet

### Mode Développement

```bash
# Lancer le serveur de développement
pnpm dev

# Le serveur démarre sur http://localhost:3000
# Ouvrez votre navigateur et accédez à http://localhost:3000
```

### Mode Production

```bash
# Construire le projet
pnpm build

# Lancer le serveur de production
pnpm start
```

---

## 🧪 Tester le Projet

### 1. Accéder à l'application

Ouvrez votre navigateur et allez à : **http://localhost:3000**

### 2. Créer un compte

- Cliquez sur "Se connecter"
- Créez un nouveau compte avec vos identifiants
- Remplissez votre profil artisan

### 3. Tester les fonctionnalités

Consultez le fichier **GUIDE_TEST_COMPLET.md** pour une liste complète des fonctionnalités à tester.

---

## 🧪 Exécuter les Tests

### Tests Unitaires

```bash
# Exécuter tous les tests
pnpm test

# Exécuter les tests en mode watch
pnpm test:watch

# Exécuter les tests avec couverture
pnpm test:coverage
```

### Tests d'Intégration

```bash
# Exécuter les tests d'intégration
pnpm test:integration
```

---

## 🔧 Commandes Utiles

### Base de Données

```bash
# Afficher l'état des migrations
pnpm db:status

# Générer les migrations
pnpm db:generate

# Exécuter les migrations
pnpm db:push

# Réinitialiser la base de données (attention : supprime toutes les données)
pnpm db:reset

# Lancer le studio Drizzle (interface graphique pour la BD)
pnpm db:studio
```

### Développement

```bash
# Vérifier les erreurs TypeScript
pnpm type-check

# Formater le code
pnpm format

# Linter le code
pnpm lint

# Corriger les erreurs de linting
pnpm lint:fix
```

### Build

```bash
# Construire le projet
pnpm build

# Prévisualiser le build
pnpm preview
```

---

## 🐛 Dépannage

### Problème : "Cannot find module"

**Solution :**
```bash
# Réinstaller les dépendances
rm -rf node_modules
pnpm install
```

### Problème : "Connection refused" (Base de données)

**Vérifier que MySQL est en cours d'exécution :**
```bash
# Sur macOS avec Homebrew
brew services start mysql

# Sur Linux
sudo systemctl start mysql

# Sur Windows
net start MySQL80
```

**Vérifier les paramètres de connexion dans `.env.local`**

### Problème : "Port 3000 already in use"

**Solution :**
```bash
# Utiliser un port différent
PORT=3001 pnpm dev

# Ou tuer le processus qui utilise le port 3000
lsof -i :3000
kill -9 <PID>
```

### Problème : "Migration failed"

**Solution :**
```bash
# Réinitialiser la base de données
pnpm db:reset

# Ou exécuter les migrations manuellement
pnpm db:push --force
```

### Problème : "Cannot authenticate"

**Vérifier :**
1. Que `JWT_SECRET` est défini dans `.env.local`
2. Que la base de données est accessible
3. Que les migrations ont été exécutées

---

## 📚 Documentation Supplémentaire

- **GUIDE_TEST_COMPLET.md** - Liste complète des fonctionnalités à tester
- **STRUCTURE_PROJET.md** - Architecture et structure du projet
- **DIAGRAMME_RELATIONS_BD.md** - Relations entre les tables de la base de données

---

## 🌐 Accès à l'Application

### URLs Principales

| Page | URL |
|------|-----|
| Accueil | http://localhost:3000 |
| Tableau de bord | http://localhost:3000/dashboard |
| Clients | http://localhost:3000/clients |
| Devis | http://localhost:3000/devis |
| Factures | http://localhost:3000/factures |
| Interventions | http://localhost:3000/interventions |
| Articles | http://localhost:3000/articles |
| Stocks | http://localhost:3000/stocks |
| Fournisseurs | http://localhost:3000/fournisseurs |
| Calendrier | http://localhost:3000/calendrier |
| Paramètres | http://localhost:3000/settings |

---

## 🔐 Sécurité

### Recommandations pour la Production

1. **Changez les secrets** :
   - Générez un nouveau `JWT_SECRET`
   - Utilisez des clés Stripe de production
   - Configurez les clés OAuth correctement

2. **Configurez HTTPS** :
   - Utilisez un certificat SSL/TLS
   - Redirigez HTTP vers HTTPS

3. **Sécurisez la base de données** :
   - Utilisez des mots de passe forts
   - Limitez l'accès réseau
   - Effectuez des sauvegardes régulières

4. **Configurez les variables d'environnement** :
   - Utilisez un gestionnaire de secrets
   - Ne committez jamais `.env.local` dans Git

---

## 📞 Support

Si vous rencontrez des problèmes :

1. Consultez le fichier **GUIDE_TEST_COMPLET.md**
2. Vérifiez les logs du serveur (`pnpm dev`)
3. Consultez la documentation Drizzle : https://orm.drizzle.team
4. Consultez la documentation tRPC : https://trpc.io

---

## ✅ Checklist d'Installation

- [ ] Node.js 18+ installé
- [ ] pnpm installé
- [ ] MySQL/MariaDB installé et en cours d'exécution
- [ ] Projet décompressé
- [ ] Dépendances installées (`pnpm install`)
- [ ] Base de données créée
- [ ] Variables d'environnement configurées (`.env.local`)
- [ ] Migrations exécutées (`pnpm db:push`)
- [ ] Serveur lancé (`pnpm dev`)
- [ ] Application accessible sur http://localhost:3000

---

## 🎉 Prêt à Commencer !

Une fois l'installation terminée, vous pouvez :

1. **Créer un compte** et vous connecter
2. **Remplir votre profil artisan**
3. **Ajouter des clients**
4. **Créer des devis** avec lignes d'articles
5. **Générer des factures**
6. **Planifier des interventions**
7. **Gérer votre stock**
8. **Tester tous les modules**

Consultez le **GUIDE_TEST_COMPLET.md** pour une liste détaillée des fonctionnalités à tester.

Bon développement ! 🚀

