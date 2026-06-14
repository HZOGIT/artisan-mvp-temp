# Audit — Upload logo : SVG / XSS / validation MIME — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : upload logo (`index.ts:226-267`, MIME), rendu du logo côté client
> (`DashboardLayout`, `Parametres`, `Vitrine`, `PortailClient`), embed PDF
> (`pdfGenerator.ts:146-177`).

---

## Conclusion : pas de XSS via logo SVG. Pas de BLOCKER/HIGH.

Enjeu : l'upload autorise **`image/svg+xml`** (`index.ts:235`). Un SVG peut embarquer
`<script>`. Combiné à la **CSP désactivée** (filée), un logo SVG rendu **inline** /
`<object>` / `dangerouslySetInnerHTML` serait du **stored XSS** servi à tous (dashboard +
vitrine publique + portail client).

### Le logo est **toujours** rendu via `<img src={logo}>` → SVG sandboxé

- `DashboardLayout.tsx:989`, `Parametres.tsx:228`, `Vitrine.tsx:209/269`,
  `PortailClient.tsx:312` : tous en **`<img src=...>`**.
- Un SVG chargé via **`<img>`** est **sandboxé** par le navigateur : **pas d'exécution de
  script**, pas de fetch externe. Donc un logo `data:image/svg+xml;base64,<svg+script>`
  est **inerte**. **Aucun** rendu inline / `<object>` / `<embed>` /
  `dangerouslySetInnerHTML` du logo dans le code.

### PDF : SVG exclu

`pdfGenerator.ts:148` n'embarque le logo que si
`^data:image/(png|jpe?g|webp);base64` → **le SVG est exclu** (jsPDF ne le rend pas). Pas de
vecteur via le PDF.

### Emails : pas de logo

Les templates email affichent le **nom** de l'artisan, pas le logo → pas de surface.

---

## Réserves LOW

1. **MIME validé depuis le `Content-Type` client** (`file.mimetype`, `index.ts:236`) =
   **spoofable** : un fichier non-image peut être stocké en `data:image/...`. Mais à
   l'affichage `<img>`, il rend une **image cassée** (pas d'exécution). Borné à 2 Mo
   (multer). Durcissement possible : vérifier les **magic bytes**.
2. **Defense-in-depth** : tant que le logo reste rendu en `<img>`, c'est sûr ; **si** un
   futur composant le rend en `<object>`/inline, le SVG deviendrait dangereux. Reco :
   **sanitizer** le SVG à l'upload (DOMPurify/SVGO strip script) ou **interdire** le SVG
   (PNG/JPG/WebP suffisent), pour ne pas dépendre du choix de rendu.

---

## Verdict

Le logo (SVG autorisé) est **toujours rendu en `<img>`** (SVG sandboxé → scripts inertes)
et **exclu du PDF** → **pas de stored XSS**, malgré la CSP désactivée. Réserves = MIME
spoofable (image cassée, LOW) + durcissement SVG conseillé. **Pas de nouvelle issue
Linear.**
