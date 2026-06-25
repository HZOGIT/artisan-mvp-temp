/*
 * Couche DOMAIN de la feature `legal` (pages statiques mentions/CGU/CGV/confidentialité). Le contenu est
 * du HTML statique et de confiance (aucune entrée utilisateur) → stocké en consts (rendu via
 * `dangerouslySetInnerHTML`, hors règle i18next sur les littéraux JSX). Markup à l'identique du legacy.
 */

export type LegalDoc = { title: string; lastUpdated: string; html: string };

export const MENTIONS_LEGALES: LegalDoc = {
  title: "Mentions légales",
  lastUpdated: "2026-05-17",
  html: `<h2>Éditeur du site</h2>
<p>Le site Operioz (accessible à l'adresse <a href="https://www.operioz.com">https://www.operioz.com</a>) est édité par&nbsp;:</p>
<ul>
<li><strong>Raison sociale</strong> : [À compléter — Nom de la société]</li>
<li><strong>Forme juridique</strong> : [SARL / SAS / EI / Auto-entrepreneur — à compléter]</li>
<li><strong>Capital social</strong> : [À compléter] €</li>
<li><strong>Adresse du siège</strong> : [À compléter — numéro, rue, code postal, ville]</li>
<li><strong>SIRET</strong> : [À compléter]</li>
<li><strong>RCS</strong> : [Ville — Numéro à compléter]</li>
<li><strong>TVA intracommunautaire</strong> : [FRXX XXX XXX XXX]</li>
<li><strong>Email</strong> : contact@operioz.com</li>
</ul>
<h2>Directeur de la publication</h2>
<p>[À compléter — Nom et prénom du représentant légal]</p>
<h2>Hébergement</h2>
<p>Le site est hébergé par <strong>Railway Corporation</strong>, 548 Market Street, San Francisco, CA 94104, États-Unis. Site : <a href="https://railway.app">https://railway.app</a>.</p>
<p>Base de données et infrastructure : hébergement professionnel ISO 27001/SOC 2. Les données sont stockées dans des centres de données situés en Europe (Frankfurt).</p>
<h2>Propriété intellectuelle</h2>
<p>L'ensemble des éléments présents sur le site Operioz (textes, images, logos, marques, structure, code source, etc.) sont la propriété exclusive de l'éditeur ou de ses partenaires, et sont protégés par les lois françaises et internationales relatives à la propriété intellectuelle.</p>
<p>Toute reproduction, distribution, modification, adaptation, retransmission ou publication, même partielle, de ces éléments est strictement interdite sans l'accord exprès écrit de l'éditeur.</p>
<h2>Limitation de responsabilité</h2>
<p>L'éditeur s'efforce d'assurer au mieux de ses possibilités l'exactitude et la mise à jour des informations diffusées sur ce site. Toutefois, il ne peut garantir l'exactitude, la précision ou l'exhaustivité des informations mises à disposition.</p>
<h2>Crédits</h2>
<p>Icônes : Lucide React (MIT). Polices : système. Framework : React 19, Vite, tRPC. Paiements : Stripe.</p>
<h2>Droit applicable</h2>
<p>Les présentes mentions légales sont régies par le droit français. En cas de litige, les tribunaux français seront seuls compétents.</p>`,
};

export const CGU: LegalDoc = {
  title: "Conditions générales d'utilisation",
  lastUpdated: "2026-05-17",
  html: `<p>Les présentes Conditions Générales d'Utilisation (ci-après «&nbsp;CGU&nbsp;») régissent l'accès et l'usage du service Operioz, plateforme SaaS de gestion pour artisans, indépendants et professionnels du terrain.</p>
<h2>Article 1 — Objet</h2>
<p>Operioz fournit un logiciel en ligne permettant de gérer son activité professionnelle&nbsp;: devis, factures, clients, interventions, paiements en ligne, assistant IA, et autres fonctionnalités décrites sur le site.</p>
<h2>Article 2 — Acceptation</h2>
<p>En créant un compte, l'Utilisateur reconnaît avoir lu, compris et accepté sans réserve les présentes CGU. Toute utilisation du service suppose l'acceptation pleine et entière des présentes.</p>
<h2>Article 3 — Conditions d'accès</h2>
<p>L'accès au service nécessite la création d'un compte avec une adresse email valide. L'Utilisateur s'engage à fournir des informations exactes lors de l'inscription et à les maintenir à jour.</p>
<p>Une période d'essai gratuit de <strong>30 jours</strong> est offerte à tout nouveau compte, sans engagement et sans saisie de carte bancaire.</p>
<h2>Article 4 — Obligations de l'Utilisateur</h2>
<ul>
<li>Utiliser le service conformément à sa destination et à la législation en vigueur.</li>
<li>Préserver la confidentialité de ses identifiants et notifier immédiatement Operioz en cas d'usage frauduleux.</li>
<li>Ne pas tenter d'accéder aux données d'autres utilisateurs, ni de contourner les mesures de sécurité.</li>
<li>Ne pas utiliser le service pour des activités illicites, frauduleuses ou contraires aux bonnes mœurs.</li>
<li>Respecter les droits de propriété intellectuelle de l'éditeur et des tiers.</li>
</ul>
<h2>Article 5 — Propriété des données</h2>
<p>L'Utilisateur reste propriétaire de toutes les données qu'il saisit ou importe dans Operioz. L'éditeur agit comme simple hébergeur et n'acquiert aucun droit de propriété sur ces données.</p>
<p>L'Utilisateur peut à tout moment exporter ses données depuis l'interface (factures, clients, devis au format Excel/CSV/PDF).</p>
<h2>Article 6 — Propriété intellectuelle</h2>
<p>Le logiciel Operioz, sa marque, son code source, ses interfaces et l'ensemble de ses contenus sont la propriété exclusive de l'éditeur, protégés par le Code de la propriété intellectuelle.</p>
<h2>Article 7 — Limitation de responsabilité</h2>
<p>Operioz s'engage à fournir un service de qualité avec un objectif de disponibilité supérieur à 99,5&nbsp;%. Néanmoins&nbsp;:</p>
<ul>
<li>L'éditeur ne saurait être tenu responsable d'éventuelles interruptions de service liées à la maintenance, aux mises à jour, ou à des cas de force majeure.</li>
<li>L'éditeur ne saurait être tenu responsable de l'usage que l'Utilisateur fait du service (calculs de TVA, mentions légales obligatoires sur factures, conformité fiscale, etc. restent sous la responsabilité de l'Utilisateur).</li>
<li>La responsabilité financière de l'éditeur est plafonnée au montant payé par l'Utilisateur sur les 12 derniers mois.</li>
</ul>
<h2>Article 8 — Disponibilité</h2>
<p>L'éditeur s'efforce de maintenir le service accessible 24h/24, 7j/7. Des opérations de maintenance peuvent toutefois entraîner des interruptions temporaires, en principe annoncées à l'avance.</p>
<h2>Article 9 — Durée et résiliation</h2>
<p>Le contrat est conclu pour une durée indéterminée, à compter de la création du compte. L'Utilisateur peut résilier à tout moment depuis son espace personnel (Paramètres → Abonnement → Annuler).</p>
<p>L'éditeur se réserve le droit de suspendre ou supprimer un compte en cas de manquement grave aux présentes CGU, après notification préalable.</p>
<p>Lors de la suppression du compte, les données personnelles sont effacées ou pseudonymisées immédiatement (hors données comptables soumises à obligation légale de 10 ans). Le compte est définitivement purgé après <strong>30 jours</strong>, délai permettant à l'Utilisateur d'exporter ses données au préalable.</p>
<h2>Article 10 — Modifications</h2>
<p>L'éditeur se réserve le droit de modifier les présentes CGU à tout moment. Les Utilisateurs sont informés des modifications substantielles par email au moins 30 jours avant entrée en vigueur.</p>
<h2>Article 11 — Données personnelles</h2>
<p>Le traitement des données personnelles est régi par notre&nbsp;<a href="/confidentialite">Politique de confidentialité</a>, conforme au RGPD.</p>
<h2>Article 12 — Droit applicable et juridiction</h2>
<p>Les présentes CGU sont régies par le droit français. En cas de litige, et après tentative de résolution amiable, le Tribunal judiciaire de Lyon sera seul compétent.</p>`,
};

export const CGV: LegalDoc = {
  title: "Conditions générales de vente",
  lastUpdated: "2026-05-17",
  html: `<p>Les présentes Conditions Générales de Vente (ci-après «&nbsp;CGV&nbsp;») régissent les abonnements payants au service Operioz, plateforme SaaS de gestion pour artisans et professionnels.</p>
<h2>Article 1 — Objet et plans</h2>
<p>Operioz propose trois plans d'abonnement&nbsp;:</p>
<ul>
<li><strong>Essentiel</strong> — 29 €/mois HT (ou 278,40 €/an HT avec -20%) — 1 utilisateur, 3 appareils, 2 sessions simultanées.</li>
<li><strong>Pro</strong> — 49 €/mois HT (ou 470,40 €/an HT) — 3 utilisateurs inclus, 3 appareils/user, 3 sessions, +10 €/mois par utilisateur supplémentaire.</li>
<li><strong>Entreprise</strong> — 89 €/mois HT (ou 854,40 €/an HT) — 10 utilisateurs inclus, 3 appareils/user, 4 sessions, +8 €/mois par utilisateur supplémentaire.</li>
<li><strong>Agence</strong> — Sur devis pour les structures de 20+ utilisateurs. Contactez-nous.</li>
</ul>
<p>Tous les plans donnent accès à l'ensemble des fonctionnalités du logiciel.</p>
<h2>Article 2 — Période d'essai</h2>
<p>Tous les nouveaux comptes bénéficient d'une période d'essai gratuit de <strong>30 jours</strong>, sans engagement et sans saisie de carte bancaire. À l'issue de la période d'essai, l'accès au service nécessite un abonnement payant.</p>
<h2>Article 3 — Prix et facturation</h2>
<p>Les prix indiqués sont en euros, hors taxes. La TVA française au taux en vigueur (20&nbsp;% à la date des présentes) sera appliquée le cas échéant.</p>
<p>L'Utilisateur peut choisir un paiement&nbsp;:</p>
<ul>
<li><strong>Mensuel</strong> : prélevé chaque mois à la date anniversaire de souscription.</li>
<li><strong>Annuel</strong> : prélevé en une fois, avec une remise de 20 %.</li>
</ul>
<p>Le changement de plan (upgrade/downgrade) prend effet au prochain cycle de facturation, sans pro-rata.</p>
<h2>Article 4 — Modalités de paiement</h2>
<p>Les paiements sont traités par <strong>Stripe Payments Europe Ltd</strong>, prestataire certifié PCI-DSS niveau 1. Aucune donnée bancaire n'est stockée par Operioz.</p>
<p>Cartes acceptées&nbsp;: Visa, Mastercard, American Express, CB. SEPA Direct Debit disponible pour les abonnements annuels.</p>
<h2>Article 5 — Échec de paiement</h2>
<p>En cas d'échec de paiement, l'Utilisateur est notifié par email. Le service est maintenu pendant <strong>7 jours</strong> pour permettre la mise à jour du moyen de paiement. Passé ce délai, l'accès est suspendu jusqu'à régularisation.</p>
<h2>Article 6 — Résiliation et remboursement</h2>
<p>L'Utilisateur peut résilier à tout moment depuis son espace personnel (Paramètres → Abonnement → Annuler). L'abonnement reste actif jusqu'à la fin de la période en cours, et n'est pas renouvelé.</p>
<p><strong>Politique de remboursement</strong> : conformément à l'article L221-28 du Code de la consommation, le service débuté avec accord exprès de l'Utilisateur lors de la souscription n'ouvre pas droit à rétractation. Aucun remboursement prorata temporis n'est effectué.</p>
<p>Exception&nbsp;: un remboursement intégral est accordé en cas de dysfonctionnement majeur imputable à Operioz dans les 30 premiers jours d'abonnement payant.</p>
<h2>Article 7 — Modification des prix</h2>
<p>Operioz se réserve le droit de modifier ses prix. Les Utilisateurs en abonnement actif bénéficient d'un préavis de <strong>30 jours</strong> avant l'application d'une augmentation, et peuvent résilier sans frais avant l'entrée en vigueur du nouveau tarif.</p>
<h2>Article 8 — Suspension du service</h2>
<p>Operioz peut suspendre l'accès en cas de manquement grave aux CGU (fraude, abus, atteinte à la sécurité), après notification.</p>
<h2>Article 9 — Données personnelles</h2>
<p>Conformément au RGPD, le traitement des données est décrit dans notre&nbsp;<a href="/confidentialite">Politique de confidentialité</a>.</p>
<h2>Article 10 — Droit applicable</h2>
<p>Les présentes CGV sont régies par le droit français. Tout litige sera de la compétence exclusive du Tribunal judiciaire de Lyon.</p>`,
};

export const CONFIDENTIALITE: LegalDoc = {
  title: "Politique de confidentialité (RGPD)",
  lastUpdated: "2026-05-17",
  html: `<p>La présente politique décrit comment Operioz collecte, utilise et protège vos données personnelles, en conformité avec le Règlement Général sur la Protection des Données (RGPD — UE 2016/679) et la Loi Informatique et Libertés.</p>
<h2>1. Responsable du traitement</h2>
<p>Le responsable du traitement est [À compléter — Nom de la société], joignable à l'adresse <a href="mailto:privacy@operioz.com">privacy@operioz.com</a>.</p>
<h2>2. Données collectées</h2>
<h3>2.1 Données fournies par l'utilisateur</h3>
<ul>
<li><strong>Compte</strong> : email, mot de passe (hashé bcrypt), nom, prénom, téléphone.</li>
<li><strong>Entreprise</strong> : raison sociale, SIRET, adresse, IBAN (pour les paiements clients).</li>
<li><strong>Données métier</strong> : clients, devis, factures, interventions, photos, documents — propriété de l'utilisateur.</li>
</ul>
<h3>2.2 Données collectées automatiquement</h3>
<ul>
<li><strong>Connexion</strong> : adresse IP, user-agent (navigateur, OS), horodatages.</li>
<li><strong>Appareils enregistrés</strong> : empreinte technique (OS + navigateur), pour la limite multi-appareils.</li>
<li><strong>Logs</strong> : actions effectuées (audit log), conservés 12 mois pour la sécurité.</li>
<li><strong>Géolocalisation des techniciens</strong> : position GPS horodatée (latitude, longitude, précision, vitesse, cap, niveau batterie), collectée lors des interventions terrain via l'application mobile. Conservée <strong>8 heures</strong> puis supprimée automatiquement.</li>
</ul>
<h3>2.3 Données de paiement</h3>
<p>Les paiements sont traités par <strong>Stripe</strong>. Operioz ne stocke AUCUNE donnée de carte bancaire. Stripe est certifié PCI-DSS niveau 1.</p>
<h2>3. Finalités du traitement</h2>
<ul>
<li><strong>Fourniture du service</strong> (base contractuelle, art. 6.1.b RGPD)&nbsp;: création de compte, accès aux fonctionnalités, support.</li>
<li><strong>Facturation et gestion comptable</strong> (obligation légale, art. 6.1.c)&nbsp;: conservation des factures émises pendant 10 ans (Code de commerce).</li>
<li><strong>Sécurité</strong> (intérêt légitime, art. 6.1.f)&nbsp;: logs, détection d'anomalies, protection contre la fraude.</li>
<li><strong>Communication produit</strong> (consentement, art. 6.1.a)&nbsp;: emails transactionnels (essai, paiement, rappels) — sans option de désinscription pour les emails service. Newsletters facultatives avec consentement explicite.</li>
<li><strong>Géolocalisation des techniciens</strong> (intérêt légitime, art. 6.1.f)&nbsp;: suivi en temps réel des interventions terrain (optimisation de la planification, sécurité des techniciens). Les techniciens sont informés de la collecte via l'application mobile. Données supprimées automatiquement après <strong>8 heures</strong>.</li>
</ul>
<h2>4. Durées de conservation</h2>
<ul>
<li><strong>Compte actif</strong> : pendant toute la durée d'utilisation du service.</li>
<li><strong>Lors de la suppression du compte</strong> : les données personnelles sont effacées immédiatement (contacts clients sans facture supprimés, données de contact pseudonymisées sur les clients liés à des factures). Le compte est définitivement purgé après 30 jours (délai permettant un éventuel export préalable).</li>
<li><strong>Factures et documents fiscaux</strong> : les données nécessaires à l'intégrité comptable sont conservées 10 ans (obligation légale, Code de commerce art. L123-22). Les informations personnelles rattachées sont pseudonymisées lors de la suppression du compte.</li>
<li><strong>Logs de sécurité</strong> : 12 mois.</li>
<li><strong>Sessions actives</strong> : 7 jours glissants.</li>
<li><strong>Positions GPS des techniciens</strong> : 8 heures (purge automatique horaire).</li>
</ul>
<h2>5. Destinataires des données</h2>
<p>Vos données ne sont JAMAIS revendues. Elles sont partagées uniquement avec&nbsp;:</p>
<ul>
<li><strong>Railway Corp.</strong> (hébergeur) — données chiffrées en transit (TLS) et au repos.</li>
<li><strong>Stripe Payments Europe</strong> — uniquement pour le traitement des paiements (PCI-DSS niveau 1).</li>
<li><strong>Resend</strong> — envoi d'emails transactionnels.</li>
<li><strong>Anthropic</strong> — uniquement si vous utilisez MonAssistant IA (contenu de la conversation envoyé à Claude pour traitement, non stocké par Anthropic au-delà de 30 jours selon leur politique).</li>
</ul>
<p>Tous nos sous-traitants sont liés par des contrats RGPD-conformes (Data Processing Agreements).</p>
<h2>6. Transferts hors UE</h2>
<p>Stripe et Anthropic sont situés aux États-Unis. Les transferts s'appuient sur les <strong>Clauses Contractuelles Types</strong> approuvées par la Commission européenne, garantissant un niveau de protection adéquat. Railway utilise des centres de données européens (Frankfurt) pour l'hébergement principal.</p>
<h2>7. Vos droits</h2>
<p>Conformément aux articles 15 à 22 du RGPD, vous disposez des droits suivants&nbsp;:</p>
<ul>
<li><strong>Accès</strong> : obtenir une copie de vos données.</li>
<li><strong>Rectification</strong> : corriger des données inexactes (directement dans l'app).</li>
<li><strong>Suppression</strong> («&nbsp;droit à l'oubli&nbsp;») : supprimer votre compte et effacer vos données personnelles. Les données à caractère strictement comptable rattachées à vos factures sont pseudonymisées et conservées 10 ans conformément à la loi.</li>
<li><strong>Portabilité</strong> : récupérer vos données dans un format structuré (Excel, CSV, PDF).</li>
<li><strong>Opposition</strong> : vous opposer au traitement basé sur l'intérêt légitime.</li>
<li><strong>Limitation</strong> : demander la limitation du traitement dans certains cas.</li>
</ul>
<p>Pour exercer ces droits, contactez-nous à&nbsp;<a href="mailto:privacy@operioz.com">privacy@operioz.com</a>. Réponse sous 30 jours maximum.</p>
<h2>8. Cookies</h2>
<p>Operioz utilise <strong>uniquement des cookies strictement nécessaires</strong> au fonctionnement du service (cookie de session JWT, préférences d'affichage). Aucun cookie publicitaire ou de tracking tiers n'est déployé.</p>
<p>Détail des cookies&nbsp;:</p>
<ul>
<li><code>token</code> : cookie de session sécurisé (HttpOnly, SameSite=Lax), durée 7 jours.</li>
<li><code>operioz:cookie-consent</code> : mémorise votre choix sur la bannière (localStorage).</li>
</ul>
<h2>9. Sécurité</h2>
<p>Operioz met en œuvre des mesures techniques et organisationnelles appropriées&nbsp;:</p>
<ul>
<li>Chiffrement TLS 1.3 pour toutes les communications.</li>
<li>Mots de passe stockés en bcrypt (coût 10).</li>
<li>Isolation multi-tenant strictement contrôlée (audit régulier).</li>
<li>Backups quotidiens chiffrés.</li>
<li>Limitation du nombre d'appareils et de sessions simultanées.</li>
</ul>
<h2>10. Violation de données</h2>
<p>En cas de violation de données présentant un risque pour vos droits et libertés, Operioz vous notifiera dans les 72 heures et déclarera l'incident à la CNIL.</p>
<h2>11. Réclamation</h2>
<p>Vous pouvez introduire une réclamation auprès de la CNIL (Commission Nationale de l'Informatique et des Libertés) si vous estimez que vos droits ne sont pas respectés&nbsp;: <a href="https://www.cnil.fr">www.cnil.fr</a>.</p>
<h2>12. Contact DPO</h2>
<p>Pour toute question relative à la protection des données, contactez notre DPO&nbsp;: <a href="mailto:privacy@operioz.com">privacy@operioz.com</a>.</p>`,
};
