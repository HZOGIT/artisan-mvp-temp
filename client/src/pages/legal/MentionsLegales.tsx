import { LegalLayout } from "./LegalLayout";

export default function MentionsLegales() {
  return (
    <LegalLayout title="Mentions légales" lastUpdated="2026-05-17">
      <h2>Éditeur du site</h2>
      <p>
        Le site Operioz (accessible à l'adresse <a href="https://www.operioz.com">https://www.operioz.com</a>)
        est édité par&nbsp;:
      </p>
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
      <p>
        Le site est hébergé par <strong>Railway Corporation</strong>,
        548 Market Street, San Francisco, CA 94104, États-Unis.
        Site : <a href="https://railway.app">https://railway.app</a>.
      </p>
      <p>
        Base de données et infrastructure : hébergement professionnel
        ISO 27001/SOC 2. Les données sont stockées dans des centres de
        données situés en Europe (Frankfurt).
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        L'ensemble des éléments présents sur le site Operioz (textes, images,
        logos, marques, structure, code source, etc.) sont la propriété
        exclusive de l'éditeur ou de ses partenaires, et sont protégés par
        les lois françaises et internationales relatives à la propriété
        intellectuelle.
      </p>
      <p>
        Toute reproduction, distribution, modification, adaptation,
        retransmission ou publication, même partielle, de ces éléments
        est strictement interdite sans l'accord exprès écrit de l'éditeur.
      </p>

      <h2>Limitation de responsabilité</h2>
      <p>
        L'éditeur s'efforce d'assurer au mieux de ses possibilités
        l'exactitude et la mise à jour des informations diffusées sur
        ce site. Toutefois, il ne peut garantir l'exactitude, la précision
        ou l'exhaustivité des informations mises à disposition.
      </p>

      <h2>Crédits</h2>
      <p>
        Icônes : Lucide React (MIT). Polices : système. Framework : React 19,
        Vite, tRPC. Paiements : Stripe.
      </p>

      <h2>Droit applicable</h2>
      <p>
        Les présentes mentions légales sont régies par le droit français.
        En cas de litige, les tribunaux français seront seuls compétents.
      </p>
    </LegalLayout>
  );
}
