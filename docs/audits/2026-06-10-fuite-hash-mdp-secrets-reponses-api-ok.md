# Audit — Fuite de hash mot de passe / secrets dans les réponses API — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : objets `users` renvoyés au client (`auth.signin`/`signup`,
> `utilisateurs.list`), `authenticateUser`/`createUserWithPassword` (`auth.ts`),
> `getUserById`/`getUserByEmail` (`db.ts`), validation des secrets au boot (`env.ts`).

---

## Conclusion : aucun hash mot de passe ni secret renvoyé au client. Pas de BLOCKER/HIGH.

Risque cherché : **divulgation du hash bcrypt** dans une réponse tRPC (visible en
DevTools/Network par tout utilisateur) → brute-force offline. Classique quand une ligne
`users` brute est renvoyée telle quelle.

### Les fonctions d'auth renvoient des objets **assainis** (construits champ par champ)

- `authenticateUser` (`auth.ts:112-116`) : malgré un `select()` complet, **retourne
  explicitement `{ id, email, name }`** — pas de spread de la ligne, **password exclu**.
  (Le type `{id,email,name}` ne suffirait pas à garantir l'absence de fuite en TS — c'est
  bien l'**objet littéral explicite** qui la garantit.)
- `createUserWithPassword` (`auth.ts:64-68`) : idem, retourne `{ id, email, name }`.
- → `auth.signin` / `auth.signup` qui font `return { success, user }` ne propagent donc
  **que** `{id,email,name}`.

### `utilisateurs.list` mappe explicitement (pas de spread)

`routers.ts:7571-7574` : `usersList.map(u => ({ id, name, prenom, email, role, actif,
lastSignedIn, createdAt }))` — **password absent**. Pas de `{...u}`.

### Les getters bruts restent côté serveur

`getUserById`/`getUserByEmail` (`db.ts`) retournent la ligne **complète** (`password`
inclus), mais `grep "return … getUserById | return user | return result[0]"` sur
`routers.ts` = **aucune** procédure ne les renvoie au client. Leurs consommateurs en
extraient des champs ou s'en servent pour des vérifs (`changePassword` lit `user.password`
côté serveur puis retourne `{success:true}`).

### Validation des secrets au boot

`env.ts` : `JWT_SECRET: z.string().min(32)` → **un secret faible/court fait échouer le
démarrage** (pas de forge de token par secret devinable). `ENV` n'expose au client aucune
clé secrète (Stripe/Resend/Twilio côté serveur ; seules `VITE_*` publiques exposées).

---

## Réserve (déjà filée / hors périmètre)

- Logs : présence de `console.log` avec emails/montants/IP (PII en logs) — relève du RGPD
  (déjà filé `rgpd-donnees-personnelles`) et de l'observabilité (OPE-13). Pas une fuite
  *réseau* vers le client.

---

## Verdict

Réponses API **exemptes de hash mot de passe et de secret** : fonctions d'auth assainies
(objet littéral explicite), `utilisateurs.list` mappé champ par champ, getters bruts
confinés au serveur, `JWT_SECRET` validé `min(32)` au boot. **Pas de nouvelle issue
Linear.**
