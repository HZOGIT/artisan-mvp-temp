# Audit — Stockage client (localStorage/sessionStorage) : pas de secret exfiltrable — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : toutes les écritures `localStorage`/`sessionStorage` du client
> (`client/src/`), au regard de la CSP désactivée + des vecteurs XSS déjà filés.

---

## Conclusion : aucun jeton/secret en storage client. Pas de BLOCKER/HIGH.

Enjeu : si un **token d'auth / secret** était en `localStorage`, un XSS (CSP désactivée,
cf. issue déjà filée) l'**exfiltrerait** → prise de compte persistante. Vérifié.

### Inventaire des écritures client (toutes non sensibles)

| Clé | Contenu | Sensibilité |
| -- | -- | -- |
| `RELOAD_FLAG` (session) | anti-boucle de reload | nulle |
| `theme` | thème UI | nulle |
| cookie-consent | choix bannière | nulle |
| `ASSISTANT_PANEL_SIZE`, `ORDER_KEY`, `HIDDEN_KEY`, `calendarWidgetSettings`, `VOICE_LANG`, `AUTO_SEND`, `SEEN_KEY`, `DISMISSED_KEY` | préférences d'affichage | nulle |
| `THREAD_LS_KEY` | **id** de thread assistant (un entier) | très faible |
| `ConseillerIAWidget` CACHE_KEY | texte de conseils IA (résumé métier) | faible |

→ **Aucun** `token`/`jwt`/`password`/`secret` en storage (`grep` confirmé : les
correspondances sont `SEEN_KEY`/`CACHE_KEY`/`ORDER_KEY`… pas des jetons).

### Le jeton d'auth est en cookie **httpOnly** (hors de portée du JS)

`auth-simple.ts` pose le cookie `token` en `httpOnly` (confirmé par l'audit auth) → **non
lisible par JavaScript**, **non stocké** en localStorage. Conséquence : même sous **XSS +
CSP désactivée**, l'attaquant **ne peut pas voler la session** via le storage (il reste
limité aux actions in-session, pas de vol de jeton pour rejouer hors-session). Cela
**réduit l'impact** des vecteurs XSS filés (pas d'escalade en prise de compte persistante
par exfiltration de token).

---

## Réserve LOW (appareil partagé)

- Le **cache de conseils IA** (texte métier) persiste en `localStorage` après déconnexion
  → sur un **appareil partagé** (tablette), le user suivant pourrait le lire. Faible (texte
  de synthèse, pas de credentials). Reco douce : purger les caches « métier » au logout.

---

## Verdict

Storage client = **préférences UI + id de thread + cache de conseils** ; **aucun secret**.
Le jeton d'auth vit en **cookie httpOnly**, donc **non exfiltrable** par XSS — ce qui borne
l'impact des XSS déjà filés. **Pas de nouvelle issue Linear.**
