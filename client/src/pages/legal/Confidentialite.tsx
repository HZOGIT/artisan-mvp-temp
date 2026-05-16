import { LegalLayout } from "./LegalLayout";

export default function Confidentialite() {
  return (
    <LegalLayout title="Politique de confidentialité (RGPD)" lastUpdated="2026-05-17">
      <p>
        La présente politique décrit comment Operioz collecte, utilise et protège
        vos données personnelles, en conformité avec le Règlement Général sur la
        Protection des Données (RGPD — UE 2016/679) et la Loi Informatique et
        Libertés.
      </p>

      <h2>1. Responsable du traitement</h2>
      <p>
        Le responsable du traitement est [À compléter — Nom de la société],
        joignable à l'adresse <a href="mailto:privacy@operioz.com">privacy@operioz.com</a>.
      </p>

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
      </ul>

      <h3>2.3 Données de paiement</h3>
      <p>
        Les paiements sont traités par <strong>Stripe</strong>. Operioz ne stocke
        AUCUNE donnée de carte bancaire. Stripe est certifié PCI-DSS niveau 1.
      </p>

      <h2>3. Finalités du traitement</h2>
      <ul>
        <li><strong>Fourniture du service</strong> (base contractuelle, art. 6.1.b RGPD)&nbsp;: création de compte, accès aux fonctionnalités, support.</li>
        <li><strong>Facturation et gestion comptable</strong> (obligation légale, art. 6.1.c)&nbsp;: conservation des factures émises pendant 10 ans (Code de commerce).</li>
        <li><strong>Sécurité</strong> (intérêt légitime, art. 6.1.f)&nbsp;: logs, détection d'anomalies, protection contre la fraude.</li>
        <li><strong>Communication produit</strong> (consentement, art. 6.1.a)&nbsp;: emails transactionnels (essai, paiement, rappels) — sans option de désinscription pour les emails service. Newsletters facultatives avec consentement explicite.</li>
      </ul>

      <h2>4. Durées de conservation</h2>
      <ul>
        <li><strong>Compte actif</strong> : pendant toute la durée d'utilisation du service.</li>
        <li><strong>Après résiliation</strong> : 30 jours pour permettre l'export, puis suppression définitive.</li>
        <li><strong>Factures et documents fiscaux</strong> : 10 ans (obligation légale).</li>
        <li><strong>Logs de sécurité</strong> : 12 mois.</li>
        <li><strong>Sessions actives</strong> : 7 jours glissants.</li>
      </ul>

      <h2>5. Destinataires des données</h2>
      <p>Vos données ne sont JAMAIS revendues. Elles sont partagées uniquement avec&nbsp;:</p>
      <ul>
        <li><strong>Railway Corp.</strong> (hébergeur) — données chiffrées en transit (TLS) et au repos.</li>
        <li><strong>Stripe Payments Europe</strong> — uniquement pour le traitement des paiements (PCI-DSS niveau 1).</li>
        <li><strong>Resend</strong> — envoi d'emails transactionnels.</li>
        <li><strong>Anthropic</strong> — uniquement si vous utilisez MonAssistant IA (contenu de la conversation envoyé à Claude pour traitement, non stocké par Anthropic au-delà de 30 jours selon leur politique).</li>
      </ul>
      <p>
        Tous nos sous-traitants sont liés par des contrats RGPD-conformes
        (Data Processing Agreements).
      </p>

      <h2>6. Transferts hors UE</h2>
      <p>
        Stripe et Anthropic sont situés aux États-Unis. Les transferts s'appuient
        sur les <strong>Clauses Contractuelles Types</strong> approuvées par la
        Commission européenne, garantissant un niveau de protection adéquat.
        Railway utilise des centres de données européens (Frankfurt) pour
        l'hébergement principal.
      </p>

      <h2>7. Vos droits</h2>
      <p>Conformément aux articles 15 à 22 du RGPD, vous disposez des droits suivants&nbsp;:</p>
      <ul>
        <li><strong>Accès</strong> : obtenir une copie de vos données.</li>
        <li><strong>Rectification</strong> : corriger des données inexactes (directement dans l'app).</li>
        <li><strong>Suppression</strong> («&nbsp;droit à l'oubli&nbsp;») : supprimer votre compte et vos données, hors obligations légales.</li>
        <li><strong>Portabilité</strong> : récupérer vos données dans un format structuré (Excel, CSV, PDF).</li>
        <li><strong>Opposition</strong> : vous opposer au traitement basé sur l'intérêt légitime.</li>
        <li><strong>Limitation</strong> : demander la limitation du traitement dans certains cas.</li>
      </ul>
      <p>
        Pour exercer ces droits, contactez-nous à&nbsp;
        <a href="mailto:privacy@operioz.com">privacy@operioz.com</a>.
        Réponse sous 30 jours maximum.
      </p>

      <h2>8. Cookies</h2>
      <p>
        Operioz utilise <strong>uniquement des cookies strictement nécessaires</strong>
        au fonctionnement du service (cookie de session JWT, préférences d'affichage).
        Aucun cookie publicitaire ou de tracking tiers n'est déployé.
      </p>
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
      <p>
        En cas de violation de données présentant un risque pour vos droits et
        libertés, Operioz vous notifiera dans les 72 heures et déclarera l'incident
        à la CNIL.
      </p>

      <h2>11. Réclamation</h2>
      <p>
        Vous pouvez introduire une réclamation auprès de la CNIL (Commission
        Nationale de l'Informatique et des Libertés) si vous estimez que vos
        droits ne sont pas respectés&nbsp;: <a href="https://www.cnil.fr">www.cnil.fr</a>.
      </p>

      <h2>12. Contact DPO</h2>
      <p>
        Pour toute question relative à la protection des données, contactez notre
        DPO&nbsp;: <a href="mailto:privacy@operioz.com">privacy@operioz.com</a>.
      </p>
    </LegalLayout>
  );
}
