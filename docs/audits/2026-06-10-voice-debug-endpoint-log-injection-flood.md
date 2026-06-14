# Audit — `/api/voice/debug` : endpoint non authentifié → log injection + log flood — LOW-MEDIUM

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `/api/voice/debug` (`index.ts:1105-1117`), consommé par l'ErrorBoundary
> client (`ErrorBoundary.tsx`, `sendBeacon`).

---

## Constat : debug endpoint public qui logue l'input brut, sans auth ni rate-limit

```typescript
// index.ts:1105 — AUCUNE authentification
app.post('/api/voice/debug', (req, res) => {
  const { events } = req.body || {};
  if (Array.isArray(events)) {
    for (const e of events) console.log(`[VoiceDebug] ${typeof e === 'string' ? e : JSON.stringify(e)}`);
  } else if (req.body?.msg) console.log(`[VoiceDebug] ${req.body.msg}`);
  res.json({ ok: true });
});
```

Le non-auth est **assumé** (crash-reporting via `sendBeacon` qui survit au démontage, y
compris quand l'état d'auth est cassé). Mais deux angles d'abus :

### 1) 🟡 Log injection (forge de lignes de log)

`console.log` reçoit la string brute → un attaquant POSTe
`events: ["faux\n[ERROR] suppression admin réussie"]` → **forge de fausses entrées de
log** (newlines / codes ANSI / control chars) → trompe l'analyse forensique, masque de
vrais événements, pollue le sink d'observabilité (OPE-13). **LOW** (intégrité des logs).

### 2) 🟡 Log flood (non authentifié, sans rate-limit)

Aucune limite → un attaquant **spamme** l'endpoint → volume de logs massif → **coût**
(sink BetterStack/New Relic), bruit, et — si logs sur disque sans rotation — **remplissage
disque** (peut concourir au crash, cf. OPE-82). Borné par le body 50 Mo par requête, mais
**répétable à l'infini**. **LOW-MEDIUM** (DoS/coût). Même classe qu'OPE-24.

---

## Distinction (anti-doublon)

- **OPE-24** (rate-limit manquant / DoS) = même **classe** pour le **flood** → à
  **rattacher** (comme `analyserPhotos`). Le **log-injection** est un angle **distinct**
  (sanitisation), non couvert ailleurs.

---

## Fix proposé

1. **Sanitiser** avant log : retirer `\r\n` et control chars, tronquer (ex. 500 chars) :
   `String(e).replace(/[\r\n\x00-\x1f]/g, ' ').slice(0, 500)`.
2. **Rate-limit** l'endpoint (par IP `CF-Connecting-IP`) + plafonner `events.length`.
3. Idéalement, le **désactiver en prod** (ou le gater) si le crash-reporting passe par le
   sink d'observabilité (OPE-13).

---

## Verdict

`/api/voice/debug` est **public + sans rate-limit** et **logue l'input brut** → **log
injection** (forge de lignes) + **log flood** (spam illimité, coût/bruit/disque). Pas de
breach de données ni RCE → **LOW-MEDIUM** (intégrité/DoS des logs). Flood = classe
**OPE-24** (rattaché) ; injection = sanitisation à ajouter. **Pas de nouvelle issue
Linear.**
