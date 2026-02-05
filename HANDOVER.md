# 📋 ARTISAN MVP - HANDOVER DOCUMENT

**Date:** 2026-02-04
**Status:** Application Ready for Development
**Checkpoint:** manus-webdev://c18c0991 (fcf1df84)

---

## 1️⃣ GITHUB REPOSITORY

**Repository URL:**
```
https://github.com/HZOGIT/artisan-mvp-temp.git
```

**Clone Command:**
```bash
git clone https://github.com/HZOGIT/artisan-mvp-temp.git
cd artisan-mvp-temp
```

**Remote Configuration:**
```bash
# User GitHub remote (authenticated)
git config --get remote.user_github.url
# Output: https://github.com/HZOGIT/artisan-mvp-temp.git
```

---

## 2️⃣ ENVIRONMENT VARIABLES - RAILWAY PRODUCTION

### Frontend Environment Variables (Vite Build)
These are used during the build process and are safe to expose to the client:

```env
# OAuth & Authentication
VITE_APP_ID=J25kfT9jDPLP68WkWNhvrq
VITE_OAUTH_PORTAL_URL=https://manus.im

# Manus Forge API (Built-in Services)
VITE_FRONTEND_FORGE_API_URL=https://forge.manus.ai
VITE_FRONTEND_FORGE_API_KEY=nn8qEWtztSGjN4BCfrbGWb

# Stripe (Public Key - Safe to expose)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_51Sp8bmLfmzcKHsmys7DqbYll76prMnMFAalBs1SmogeYagLfPL1u6WBQd4WDCwdFLNkM0VFTHgvNz3a7wm0MiAx000hhpTr0tW

# Analytics
VITE_ANALYTICS_ENDPOINT=https://artisan-mvp-temp-production.up.railway.app/fake-analytics
VITE_ANALYTICS_WEBSITE_ID=railway-deploy

# App Info
VITE_APP_TITLE=Artisan Pro
VITE_APP_LOGO=https://artisan-mvp-temp-production.up.railway.app/logo.png
```

### Backend Environment Variables (Server-side - SECRETS)
⚠️ **These are SECRET and must NOT be exposed to the client:**

```env
# Database Connection (MySQL)
DATABASE_URL=mysql://[user]:[password]@[host]:[port]/[database]

# Authentication
JWT_SECRET=[your-jwt-secret-key]

# Stripe (Secret Key - DO NOT EXPOSE)
STRIPE_SECRET_KEY=sk_test_[your-stripe-secret-key]
STRIPE_WEBHOOK_SECRET=whsec_[your-webhook-secret]

# Manus API (Server-side)
BUILT_IN_FORGE_API_URL=https://forge.manus.ai
BUILT_IN_FORGE_API_KEY=[your-forge-api-key]

# Owner Info
OWNER_OPEN_ID=[owner-id]
OWNER_NAME=[owner-name]

# Optional: Email Service
SMTP_HOST=[smtp-host]
SMTP_PORT=[smtp-port]
SMTP_USER=[smtp-user]
SMTP_PASS=[smtp-password]

# Optional: SMS Service (Twilio)
TWILIO_ACCOUNT_SID=[twilio-sid]
TWILIO_AUTH_TOKEN=[twilio-token]
TWILIO_PHONE_NUMBER=[twilio-number]

# Optional: S3 Storage
S3_BUCKET=[bucket-name]
S3_REGION=[region]
S3_ACCESS_KEY=[access-key]
S3_SECRET_KEY=[secret-key]

# Optional: Monitoring
SENTRY_DSN=[sentry-dsn]

# Environment
NODE_ENV=production
PORT=3000
```

---

## 3️⃣ DATABASE - MYSQL CREDENTIALS

### Database Configuration

The application uses **MySQL** with **Drizzle ORM**.

**Database Connection String Format:**
```
mysql://username:password@hostname:port/database_name
```

**To get the DATABASE_URL from Railway:**

1. Go to https://railway.app
2. Select your project "artisan-mvp-temp"
3. Click on the MySQL plugin/service
4. Copy the connection string from "Connection URL" or "DATABASE_URL"

### Database Schema

**Location:** `/home/ubuntu/artisan-mvp-temp/drizzle/schema.ts`

**Main Tables:**
- `users` - User accounts with authentication
- `clients` - Client information
- `devis` - Quotations
- `devis_lignes` - Quotation line items
- `factures` - Invoices
- `factures_lignes` - Invoice line items
- `interventions` - Interventions/Service calls
- `bibliotheque_articles` - Article library

### Database Migrations

**Run migrations locally:**
```bash
# Install dependencies
pnpm install

# Push schema changes to database
pnpm db:push

# This runs: drizzle-kit generate && drizzle-kit migrate
```

---

## 4️⃣ PROJECT STRUCTURE

```
artisan-mvp-temp/
├── client/                    # React Frontend
│   ├── src/
│   │   ├── pages/            # Page components
│   │   ├── components/       # Reusable UI components
│   │   ├── lib/
│   │   │   └── trpc.ts       # tRPC client setup
│   │   ├── App.tsx           # Main routing
│   │   ├── main.tsx          # Entry point
│   │   └── index.css         # Global styles
│   └── index.html
│
├── server/                    # Node.js Backend
│   ├── _core/                # Framework core
│   │   ├── index.ts          # Server entry point
│   │   ├── auth.ts           # Authentication logic
│   │   ├── context.ts        # tRPC context
│   │   ├── env.ts            # Environment variables
│   │   └── ...               # Other services
│   ├── routers.ts            # tRPC procedures
│   ├── db.ts                 # Database helpers
│   └── stripe/               # Stripe integration
│
├── drizzle/                   # Database
│   ├── schema.ts             # Database schema
│   └── migrations/           # Migration files
│
├── shared/                    # Shared types & constants
├── storage/                   # S3 helpers
│
├── package.json              # Dependencies
├── drizzle.config.ts         # Drizzle configuration
├── tsconfig.json             # TypeScript config
├── vite.config.ts            # Vite config
└── .env.production           # Production env vars
```

---

## 5️⃣ FEATURES

The application includes the following features:

- Authentication
- Profil Artisan
- Gestion Clients
- Gestion Devis
- Factures
- Interventions
- Articles
- Tableau de bord
- Statistiques
- Import Clients
- Relances Devis
- Modèles Email
- Modèles Transactionnels
- Contrats
- Mode Mobile
- Techniciens
- Calendrier
- Stocks
- Rapport Commande
- Fournisseurs
- Perf. Fournisseurs
- Chat
- Avis Clients
- Géolocalisation
- Planification
- Rapports
- Comptabilité
- Congés
- Prévisions CA
- Alertes Prévisions
- Véhicules
- Badges
- Chantiers
- Intégrations Compta
- Devis IA
- And more...

---

## 6️⃣ DEVELOPMENT SETUP

### Local Development

**Prerequisites:**
- Node.js 22+
- pnpm 10+
- MySQL (local or remote)

**Installation:**
```bash
# Clone repository
git clone https://github.com/HZOGIT/artisan-mvp-temp.git
cd artisan-mvp-temp

# Install dependencies
pnpm install

# Create .env.local with your DATABASE_URL
echo "DATABASE_URL=mysql://..." > .env.local

# Run migrations
pnpm db:push

# Start development server
pnpm dev
```

**Development Server:**
```
Frontend: http://localhost:5173
Backend: http://localhost:3000
API: http://localhost:3000/api/trpc
```

### Build & Deploy

```bash
# Build for production
pnpm build

# Start production server
pnpm start

# Run tests
pnpm test

# Format code
pnpm format

# Type check
pnpm check
```

---

## 7️⃣ TECHNOLOGY STACK

- **Frontend:** React 19 + TypeScript + Tailwind CSS 4
- **Backend:** Node.js + Express 4 + tRPC 11
- **Database:** MySQL + Drizzle ORM
- **Authentication:** JWT (jose) + bcryptjs
- **API:** tRPC (type-safe RPC)
- **Deployment:** Railway
- **Testing:** Vitest
- **Package Manager:** pnpm

---

## 8️⃣ PRODUCTION DEPLOYMENT

**Current Production URL:**
```
https://artisan-mvp-temp-production.up.railway.app
```

**Or Custom Domain:**
```
https://artisan.cheminov.com
```

**Deployment Process:**
1. Push changes to GitHub `main` branch
2. Railway automatically deploys on push
3. Environment variables are configured in Railway dashboard

---

## 9️⃣ IMPORTANT NOTES

### Development Guidelines

- Follow the existing code structure and patterns
- Test changes locally before deploying
- Create checkpoints before major changes
- Maintain backward compatibility where possible
- Document significant changes

### What to Consider

- Review existing code patterns before implementing new features
- Test with realistic data
- Validate across different browsers
- Check console for errors and warnings

---

## 🔟 CONTACT & SUPPORT

**Project Owner:** [Your Name]
**GitHub:** https://github.com/HZOGIT/artisan-mvp-temp
**Deployment:** Railway
**Last Updated:** 2026-02-04

---

## 📚 ADDITIONAL RESOURCES

- **Drizzle ORM Docs:** https://orm.drizzle.team
- **tRPC Docs:** https://trpc.io
- **React Docs:** https://react.dev
- **Tailwind CSS:** https://tailwindcss.com
- **Railway Docs:** https://docs.railway.app

---

**End of Handover Document**
