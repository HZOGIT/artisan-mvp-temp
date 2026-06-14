# Audit — Protection des routes côté client (React) — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : routage `App.tsx` (wouter), gate d'authentification
> `DashboardLayout` + `useAuth`, séparation routes publiques / authentifiées.

---

## Conclusion : protection adéquate. Pas de BLOCKER/HIGH.

### Séparation publique / authentifiée

`Router()` (`App.tsx:235`) liste explicitement les routes **publiques** (`/`,
`/signin`, `/signup`, `/forgot-password`, `/reset-password`, `/signature/:token`,
`/portail/:token`, `/avis/:token`, `/vitrine/:slug`, pages légales, paiement) puis
un **catch-all** `<Route component={AuthenticatedRoutes} />` (`:265`) pour tout le
reste.

### Gate d'authentification effective (`DashboardLayout`)

Toutes les routes authentifiées passent par `DashboardLayout`, qui **bloque le
rendu si non authentifié** :

```tsx
// DashboardLayout.tsx:701-705
const { loading, user } = useAuth();
if (loading) return <DashboardLayoutSkeleton />;
if (!user) return ( /* écran « Connexion requise » + bouton Se connecter */ );
// children (la page) n'est rendu QUE si user existe
```

→ Un utilisateur non authentifié atteignant `/clients`, `/comptabilite`, etc.
obtient un écran **« Connexion requise »** propre ; **les composants de page (et
leurs requêtes tRPC) ne sont pas montés**. Pas de page cassée, pas de requête qui
fuite.

### Le vrai périmètre = serveur (déjà vérifié)

- **Auth** : chaque endpoint tRPC est `protectedProcedure` → 401 sans cookie JWT
  valide. La protection client n'est qu'une **commodité UX** ; la donnée est
  gardée côté serveur.
- **Rôles/permissions** : les pages restreintes (`/comptabilite`, `/factures`,
  `/utilisateurs`…) **ne sont pas masquées** par rôle côté client — mais les
  endpoints sont gardés serveur (`comptaVoirProcedure`, `facturesVoirProcedure`,
  `utilisateursGererProcedure`…). Un `technicien` qui navigue vers une page
  restreinte voit la page mais ses requêtes renvoient **FORBIDDEN** (pas de
  donnée). Les **trous de garde serveur** (clients/contrats/interventions/rdv/
  6 routes devis) sont **OPE-17** — c'est là qu'est le vrai risque, pas dans le
  routage client.

---

## Réserve (UX mineure)

Les liens de navigation et routes des pages restreintes par rôle ne sont pas
filtrés selon `user.permissions`/`role` côté client → un collaborateur voit des
entrées de menu menant à des pages qui afficheront des erreurs FORBIDDEN. **UX**
seulement (la sécurité est serveur). Idéal : masquer les entrées de menu selon les
permissions (cosmétique).

---

## Verdict

Protection des routes client **correcte** : séparation public/authentifié claire,
gate `DashboardLayout`/`useAuth` qui empêche le rendu (et les requêtes) sans
session, et **enforcement réel côté serveur**. Aucune autorisation purement
client-side créant une fausse sécurité exploitable. Le risque d'autorisation
résiduel est **serveur** (OPE-17). **Pas d'issue Linear.**
