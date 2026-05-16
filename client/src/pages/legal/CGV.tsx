import { LegalLayout } from "./LegalLayout";

export default function CGV() {
  return (
    <LegalLayout title="Conditions générales de vente" lastUpdated="2026-05-17">
      <p>
        Les présentes Conditions Générales de Vente (ci-après «&nbsp;CGV&nbsp;») régissent
        les abonnements payants au service Operioz, plateforme SaaS de gestion
        pour artisans et professionnels.
      </p>

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
      <p>
        Tous les nouveaux comptes bénéficient d'une période d'essai gratuit de
        <strong> 30 jours</strong>, sans engagement et sans saisie de carte bancaire.
        À l'issue de la période d'essai, l'accès au service nécessite un abonnement payant.
      </p>

      <h2>Article 3 — Prix et facturation</h2>
      <p>
        Les prix indiqués sont en euros, hors taxes. La TVA française au taux en
        vigueur (20&nbsp;% à la date des présentes) sera appliquée le cas échéant.
      </p>
      <p>
        L'Utilisateur peut choisir un paiement&nbsp;:
      </p>
      <ul>
        <li><strong>Mensuel</strong> : prélevé chaque mois à la date anniversaire de souscription.</li>
        <li><strong>Annuel</strong> : prélevé en une fois, avec une remise de 20 %.</li>
      </ul>
      <p>
        Le changement de plan (upgrade/downgrade) prend effet au prochain cycle
        de facturation, sans pro-rata.
      </p>

      <h2>Article 4 — Modalités de paiement</h2>
      <p>
        Les paiements sont traités par <strong>Stripe Payments Europe Ltd</strong>,
        prestataire certifié PCI-DSS niveau 1. Aucune donnée bancaire n'est
        stockée par Operioz.
      </p>
      <p>
        Cartes acceptées&nbsp;: Visa, Mastercard, American Express, CB. SEPA Direct Debit
        disponible pour les abonnements annuels.
      </p>

      <h2>Article 5 — Échec de paiement</h2>
      <p>
        En cas d'échec de paiement, l'Utilisateur est notifié par email. Le service
        est maintenu pendant <strong>7 jours</strong> pour permettre la mise à jour du
        moyen de paiement. Passé ce délai, l'accès est suspendu jusqu'à régularisation.
      </p>

      <h2>Article 6 — Résiliation et remboursement</h2>
      <p>
        L'Utilisateur peut résilier à tout moment depuis son espace personnel
        (Paramètres → Abonnement → Annuler). L'abonnement reste actif jusqu'à
        la fin de la période en cours, et n'est pas renouvelé.
      </p>
      <p>
        <strong>Politique de remboursement</strong> : conformément à l'article L221-28
        du Code de la consommation, le service débuté avec accord exprès de
        l'Utilisateur lors de la souscription n'ouvre pas droit à rétractation.
        Aucun remboursement prorata temporis n'est effectué.
      </p>
      <p>
        Exception&nbsp;: un remboursement intégral est accordé en cas de dysfonctionnement
        majeur imputable à Operioz dans les 30 premiers jours d'abonnement payant.
      </p>

      <h2>Article 7 — Modification des prix</h2>
      <p>
        Operioz se réserve le droit de modifier ses prix. Les Utilisateurs en
        abonnement actif bénéficient d'un préavis de <strong>30 jours</strong> avant
        l'application d'une augmentation, et peuvent résilier sans frais avant
        l'entrée en vigueur du nouveau tarif.
      </p>

      <h2>Article 8 — Suspension du service</h2>
      <p>
        Operioz peut suspendre l'accès en cas de manquement grave aux CGU
        (fraude, abus, atteinte à la sécurité), après notification.
      </p>

      <h2>Article 9 — Données personnelles</h2>
      <p>
        Conformément au RGPD, le traitement des données est décrit dans notre&nbsp;
        <a href="/confidentialite">Politique de confidentialité</a>.
      </p>

      <h2>Article 10 — Droit applicable</h2>
      <p>
        Les présentes CGV sont régies par le droit français. Tout litige sera
        de la compétence exclusive du Tribunal judiciaire de Lyon.
      </p>
    </LegalLayout>
  );
}
