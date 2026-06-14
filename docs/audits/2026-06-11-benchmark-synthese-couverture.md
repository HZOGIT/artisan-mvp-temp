# Benchmark Operioz × Odoo 19 — Synthèse de couverture (état au 2026-06-11)

**Projet** : Operioz × Odoo 19 — Benchmark & améliorations modules

> Point d'étape : **tous les domaines de la rotation** ont été comparés à Odoo 19.
> Chaque domaine est soit **filé** (tickets d'écart à valeur), soit **à parité MVP**
> (note `-ok`). Objectif de cette note : éviter le **sur-ticketing** et donner une carte
> de priorisation.

---

## Domaines à PARITÉ MVP (9 notes `-ok`, aucun écart à ouvrir)

`clients-crm`, `contrats-recurrents`, `conges-hr-holidays`, `stock-inventaire`,
`notes-de-frais`, `projets-chantiers`, `planning-interventions`, `paiements-en-ligne`,
`avis-rating`.

→ Modèles **au niveau MVP** ; les rares écarts sont **déjà filés** (OPE-92→135) ou relèvent
de l'**Odoo-enterprise** (sur-ingénierie hors périmètre artisan).

## Domaines FILÉS — tickets d'écart à valeur (cette session, OPE-141→159)

| Thème | Tickets |
| -- | -- |
| **Conformité TVA (FR/BTP)** | OPE-141 (autoliquidation sous-traitance), 145 (exigibilité encaissements), 153 (déductibilité partielle), 154 (attestation TVA réduite travaux), 142 (taux par défaut article) |
| **Catalogue / articles** | 142 (TVA défaut), 143 (coût/marge) |
| **Trésorerie / risque** | 144 (encours client), 155 (trésorerie prévisionnelle) |
| **Encaissement** | 147 (rapprochement bancaire des crédits), 159 (QR virement EPC) |
| **Communication client** | 152 (suivi « vu »), 157 (From/Reply-To artisan), 158 (référence client B2B) |
| **Devis** | 146 (options choisies au portail), 149 (pièces jointes) |
| **Achats** | 150 (alerte retard livraison) |
| **Mentions légales** | 151 (forme juridique/capital/RCS/RM) |
| **Mobilité** | 156 (flux iCal calendrier) |
| **Emails (robustesse)** | 148 (reprise d'envoi / outbox) |

> Antérieurs (sessions précédentes) : OPE-92→140 couvrent B2B/adresses/tags/activités/
> fusion (clients), réception/facturation/réappro/perf (achats), inaltérabilité/clôture/
> Factur-X (compta), heures/coût/conflit/multi-tech (chantiers/planning), avis légaux, etc.

---

## Lecture transversale (priorisation lancement)

- **Chaîne TVA cohérente** (collecte → exigibilité → déductibilité → autoliquidation →
  attestation travaux) : forte valeur **expert-comptable** + conformité **BTP**.
  Candidats prioritaires post-lancement : OPE-145, OPE-154 (High).
- **Cash** (encours OPE-144 → trésorerie OPE-155 → rapprochement OPE-147) : survie TPE.
- **Communication client** (OPE-157 Reply-To, OPE-152 suivi) : impact business **invisible**
  mais direct (réponses perdues, relances à l'aveugle).

## Verdict

Le benchmark a atteint une **couverture quasi exhaustive** des 13 domaines de la rotation.
Les prochains firings privilégieront : (a) des **notes `-ok`** quand un sous-domaine est à
parité, (b) des écarts **réellement neufs** (sous-modules non encore comparés en détail :
ex. `l10n_fr_pdp` e-invoicing 2026, `payment` providers), en **évitant le sur-ticketing**
des raffinements marginaux. **Aucun nouveau ticket ce firing** (synthèse).
