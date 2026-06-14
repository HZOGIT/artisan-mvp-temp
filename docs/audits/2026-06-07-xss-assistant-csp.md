# Audit — XSS DOM (assistant) & posture CSP

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : posture de sécurité HTTP (CORS / CSP / headers) et sinks
> `dangerouslySetInnerHTML` côté client.

---

## Ce qui fonctionne correctement

- **En-têtes de sécurité** présents : `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`,
  `Referrer-Policy`, `Permissions-Policy` (`index.ts:179-185`). ✓
- **Pas de CORS permissif** : aucun `app.use(cors(...))` → pas d'
  `Access-Control-Allow-Origin` émis → les lectures cross-origin sont bloquées
  par défaut (sûr). Cookie `sameSite=lax` (anti-CSRF sur les POST). ✓
- 2 des 3 `dangerouslySetInnerHTML` sont **sans donnée utilisateur** :
  `chart.tsx:81` (CSS de couleurs du graphe, dev-controlled) et `Home.tsx:141`
  (`<style>` constante `ANIMATIONS`). ✓

---

## 🟠 HIGH — XSS DOM dans l'assistant : rendu HTML non sanitizé + CSP désactivée

### Problème

Le contenu des messages de l'assistant est injecté en HTML brut :

```tsx
// client/src/pages/Assistant.tsx:450
<div dangerouslySetInnerHTML={{ __html: renderContent(msg.content || "") }} />
```

`renderContent` (`Assistant.tsx:404`) fait un « markdown → HTML » par regex
**sans jamais échapper le HTML d'entrée** :

```tsx
const renderContent = (content) =>
  (content || "")
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code ...>$1</code>')
    .replace(/\n/g, '<br/>');
// ← aucun escape : tout HTML présent dans `content` passe tel quel
```

Donc un `content` contenant `<img src=x onerror="…">` ou `<script>` est injecté
**verbatim** dans le DOM → exécution de script.

### Aggravant : pas de CSP

Le header `Content-Security-Policy` est **commenté** (`index.ts:139`). Il n'y a
donc **aucun filet** pour bloquer l'exécution d'un script injecté ou l'exfiltration
réseau. Une CSP stricte (`script-src 'self'`) neutraliserait l'essentiel de cette
classe d'attaque.

### Vecteurs d'injection (`msg.content`)

- **Prompt injection** : le modèle (Gemini) peut être amené à émettre du HTML
  dans sa réponse.
- **Donnée attaquant-contrôlée ré-émise par l'IA** : les outils de l'assistant
  (ex. `chercher_client`, `lister_*`) renvoient des **noms de clients / désignations
  de devis** que l'IA ré-affiche. Un client nommé
  `<img src=x onerror="...">` (créé via le portail public ou importé) déclenche
  l'XSS quand l'artisan interroge l'assistant à son sujet.
- **Transcripts vocaux** postés par le client (`/api/voice/persist`) puis
  raffichés.

### Impact

XSS dans la **session authentifiée de l'artisan**. Le cookie est `httpOnly`
(token non lisible), mais le script injecté peut **agir au nom de l'artisan** :
appeler n'importe quelle mutation tRPC (changer l'email du compte via
`auth.updateEmail`, créer/exfiltrer des factures/clients, etc.) et exfiltrer
toutes les données affichées.

### Fix proposé

1. **Échapper le HTML** dans `renderContent` **avant** d'appliquer les regex
   markdown, ou utiliser un rendu markdown sûr (`marked` + `DOMPurify`, ou
   `react-markdown` sans `rehype-raw`).
   ```ts
   const esc = (s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
   // appliquer esc(content) puis les remplacements markdown
   ```
2. **Réactiver une CSP** stricte (`default-src 'self'; script-src 'self'; …`) en
   tête de toutes les réponses (defense-in-depth).

### Estimation

~1 h — escape dans `renderContent` (ou DOMPurify) + activation CSP + test payload.

---

## Estimation totale

- HIGH (XSS assistant + CSP désactivée) : ~1 h
