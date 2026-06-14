# Audit — Prévisions CA : historique calculé en TTC (→ OPE-53)

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `previsionsRouter` (`routers.ts:5923`) — `getHistorique` (`:5924`),
> `calculerHistorique` (`:5931`) ; `getHistoriqueCA` (`db.ts:2692`),
> `calculerHistoriqueCAMensuel` (`db.ts:2700`).

---

## Multi-tenant OK

`getHistorique` / `calculerHistorique` résolvent `getOrCreateArtisan(ctx.user.id)` et
appellent `getHistoriqueCA(artisan.id, …)` / `calculerHistoriqueCAMensuel(artisan.id)` ;
la requête filtre `WHERE artisanId = ?`. → **pas d'IDOR**.

## 🟠 HIGH — CA en TTC dans l'historique des prévisions → rattaché à **OPE-53**

```typescript
// db.ts calculerHistoriqueCAMensuel (~:2700) — WHERE artisanId=? AND statut='payee'
d.ca += parseFloat(String(f.totalTTC || '0'));   // ← TTC au lieu de HT
```

L'historique mensuel de CA qui alimente **toute la feature Prévisions** somme le
**TTC** (TVA incluse) → gonflé de ~+20 %, et la **prédiction du CA futur** dérivée en
hérite. Avoirs non déduits (`statut='payee'` seul).

C'est le **même bug** qu'OPE-53 (CA en TTC) sur un **chemin non énuméré** (OPE-53 liste
dashboard/mensuel/YoY/rapport financier, pas `calculerHistoriqueCAMensuel`). → **OPE-53
étendu par commentaire** (à basculer sur `totalHT` + déduire les avoirs dans le même
fix). Pas de nouvelle issue.

---

## Verdict

Prévisions CA : **scopé tenant** (pas d'IDOR), mais l'historique CA est en **TTC** →
prévisions surévaluées ~+20 %. Même classe qu'**OPE-53**, spot non listé → rattaché par
commentaire. **Pas de nouvelle issue Linear.**
