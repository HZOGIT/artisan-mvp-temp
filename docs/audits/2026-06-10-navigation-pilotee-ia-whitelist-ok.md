# Audit — Navigation pilotée par l'IA (tool `naviguer_vers`) : open redirect / XSS — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : tool `naviguer_vers` (`assistantTools.ts:1616-1640`, `VALID_NAV_PAGES`),
> consommation client de l'event `navigate` (`client/src/pages/Assistant.tsx:313-318`).

---

## Conclusion : navigation IA whitelistée + sandboxée. Pas de BLOCKER/HIGH.

Enjeu : l'assistant peut émettre une action `navigate` que le **client exécute**. Sous
**prompt-injection** (un devis/email piégé pousse l'IA à appeler `naviguer_vers` avec une
cible hostile), pourrait-on forcer un **open redirect** (`https://evil.com`) ou un
**`javascript:` URI** (XSS) ?

### 1) Whitelist **serveur** des pages

```typescript
// assistantTools.ts:1616 — liste CONSTANTE de routes internes
const VALID_NAV_PAGES = ["/factures", "/devis", "/clients", "/interventions", "/stocks", …];
// :1627 — rejet de toute autre valeur
if (!VALID_NAV_PAGES.includes(page)) return fail(`Page invalide : ${page}…`);
```

→ La cible `page` doit être **exactement** une route interne connue. Une URL externe,
un `javascript:`, ou une route inconnue → **rejeté** (« Page invalide »). L'IA ne peut pas
fabriquer une cible arbitraire.

### 2) Sandboxing **client** (defense-in-depth)

`Assistant.tsx:318` : `setLocation(target)` = **wouter** (History API `pushState`).

- `pushState` vers une **autre origine** lève une **SecurityError** → pas de redirection
  cross-origin possible même si la whitelist était contournée.
- Un `javascript:` serait traité comme un **chemin relatif** (résolu sous l'origine), **pas
  exécuté** → pas d'XSS.
- `filtre` est `encodeURIComponent`-é (`:316`) ; `message` est rendu en **JSX** (auto-
  échappé).

---

## Verdict

La navigation déclenchée par l'IA est **doublement protégée** : whitelist **serveur**
(`VALID_NAV_PAGES`, routes internes constantes) + **History API** côté client (pas de
cross-origin, pas d'exécution `javascript:`). Robuste même sous **prompt-injection** : ni
**open redirect** ni **XSS**. **Pas de nouvelle issue Linear.**
