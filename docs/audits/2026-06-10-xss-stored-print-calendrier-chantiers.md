# Audit — XSS stocké via impression du calendrier chantiers (`document.write` de noms non échappés)

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin · **Sévérité : 🟠 HIGH**

> Périmètre : `CalendrierChantiers.tsx` — fonction d'impression
> (`printWindow.document.write`, ~`:667-895`).

---

## 🟠 HIGH — un nom de chantier/technicien malveillant s'exécute dans la session du propriétaire à l'impression

### Le sink : `document.write` de données tenant **non échappées**

La fonction d'impression construit le HTML de la fenêtre de print en **interpolant
directement** des champs tenant, **sans aucun échappement** :

```tsx
// CalendrierChantiers.tsx (print HTML via printWindow.document.write)
… ${chantiers?.find(c => c.id === selectedChantierId)?.nom || ''}        // nom chantier
… ${dayInterventions.slice(0,3).map(i => `… ${i.chantierNom} …`)}         // nom chantier (intervention)
… ${(techniciens).slice(0,5).map(t => `… ${t.prenom || ''} ${t.nom} …`)} // nom technicien
… ${(chantiers).slice(0,5).map(c => `… ${c.nom} …`)}                       // nom chantier (légende)
```

`grep escape|sanitize` sur la fonction → **0**. Le HTML est écrit via `document.write`
dans une fenêtre **même origine**. **La CSP est désactivée** (cf. OPE-48) → aucun filet.

### La source est contrôlable par un **collaborateur faiblement privilégié**

Le rôle **`technicien`** a `chantiers.gerer` (ROLE_TEMPLATES) → il peut **créer/nommer** un
chantier. En posant un nom du type :

```
<img src=x onerror="fetch('/api/trpc/artisan.updateProfile',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:'...iban...'})">
```

→ quand le **propriétaire** (ou un autre user) **imprime** le calendrier des chantiers (qui
liste les noms de chantiers/techniciens), le payload **s'exécute dans SA session** (même
origine, cookie d'auth envoyé).

### Impact : escalade de privilège intra-tenant + chaîne

`technicien` → **session du propriétaire** → actions owner-level **sans ré-auth** :
changer l'**email** (OPE-85) / l'**IBAN** (OPE-86), s'octroyer des **permissions**, etc.
Stored XSS persistant (le nom reste jusqu'à correction).

**Précondition** : un collaborateur (ou compte collaborateur compromis) pose un nom
malveillant **et** un user imprime la vue. Trigger « impression » moins fréquent que le
chat (OPE-48), d'où une exploitabilité un cran sous l'assistant, mais **impact identique**
(XSS session, CSP off).

---

## Distinction (anti-doublon)

- **OPE-48** = XSS via `renderContent` de **l'assistant** (`Assistant.tsx:450`). **Sink
  différent** (fenêtre d'impression `document.write` de `CalendrierChantiers`), **source
  différente** (noms chantier/technicien intra-tenant). Même **classe** (HTML non échappé +
  CSP off) → lié, mais non couvert par OPE-48. → **Pas de doublon.**
- Chaîne d'escalade vers **OPE-85/OPE-86** (actions sensibles sans ré-auth).

---

## Fix proposé

1. **Échapper** toute donnée interpolée dans le HTML d'impression (`escapeHtml` sur
   `nom`/`prenom`/`chantierNom`…), ou construire le DOM via `textContent` plutôt que
   `document.write`.
2. **Réactiver la CSP** (OPE-48) — filet de défense en profondeur sur tous les sinks.
3. (Connexe) valider/sanitiser les noms à la saisie (pas de `<>` dans un nom de chantier).

---

## Verdict

L'impression du calendrier chantiers `document.write` des **noms non échappés** ; un
`technicien` (qui peut nommer un chantier) plante un payload qui **s'exécute dans la
session du propriétaire à l'impression** (CSP off) → **XSS stocké + escalade**. Sink
distinct d'OPE-48. **🟠 HIGH → issue Linear créée.**
