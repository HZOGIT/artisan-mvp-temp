// Couche DOMAIN de la feature `documentation` (guide d'utilisation). Catalogue de CONTENU statique (data,
// pas du libellé d'interface → reste en domain) + recherche pure. `iconKey` (string) au lieu d'un composant
// React pour garder le domain pur ; l'UI mappe `iconKey` → icône. 0 dépendance React/tRPC.

export type DocSubsection = { title: string; content: string[] };
export type DocSection = { id: string; iconKey: string; title: string; color: string; subsections: DocSubsection[] };

// Normalisation accents/casse pour une recherche tolérante. PUR.
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// Filtre les sections par requête (titre de sous-section OU ligne de contenu), sections vides retirées. PUR.
export function filterSections(sections: readonly DocSection[], query: string): DocSection[] {
  const q = normalize(query);
  if (!q) return sections.slice();
  return sections
    .map((section) => ({
      ...section,
      subsections: section.subsections.filter(
        (sub) => normalize(sub.title).includes(q) || sub.content.some((line) => normalize(line).includes(q)),
      ),
    }))
    .filter((s) => s.subsections.length > 0);
}

export const DOC_SECTIONS: DocSection[] = [
  {
    id: "premiers-pas",
    iconKey: "LayoutDashboard",
    title: "1. Premiers pas",
    color: "text-blue-500",
    subsections: [
      {
        title: "Se connecter",
        content: [
          "Rendez-vous sur www.operioz.com et cliquez sur « Se connecter ». Saisissez votre adresse email et votre mot de passe. Vous arrivez directement sur le tableau de bord.",
        ],
      },
      {
        title: "Le tableau de bord",
        content: [
          "Le tableau de bord est votre page d'accueil. Vous y trouvez en un coup d'œil :",
          "• Le nombre de devis et factures en cours",
          "• Le chiffre d'affaires du mois",
          "• Les interventions prévues aujourd'hui",
          "• Les alertes importantes (factures impayées, stocks bas)",
          "• L'activité récente de votre entreprise",
        ],
      },
      {
        title: "Configurer votre profil",
        content: [
          "Allez dans « Mon profil » depuis le menu à gauche. Complétez les informations de votre entreprise : nom, SIRET, adresse, téléphone, email. Ces informations apparaîtront sur vos devis et factures.",
          "💡 Pensez à ajouter votre logo dans les paramètres. Il apparaîtra sur tous vos documents PDF.",
        ],
      },
      {
        title: "Les paramètres",
        content: [
          "Dans « Paramètres », vous pouvez personnaliser :",
          "• Les préfixes de numérotation (DEV- pour les devis, FAC- pour les factures)",
          "• Les mentions légales affichées sur vos documents",
          "• Les conditions de règlement par défaut",
          "• Votre taux de TVA habituel",
        ],
      },
    ],
  },
  {
    id: "clients",
    iconKey: "Users",
    title: "2. Clients",
    color: "text-green-500",
    subsections: [
      {
        title: "Ajouter un client",
        content: [
          "Cliquez sur « Clients » dans le menu, puis sur le bouton « Nouveau client ». Remplissez au minimum le nom et l'email. Vous pouvez aussi ajouter le téléphone, l'adresse et des notes personnelles.",
        ],
      },
      {
        title: "Rechercher et filtrer les clients",
        content: [
          "Utilisez la barre de recherche en haut de la liste pour trouver rapidement un client par son nom, prénom ou email. La recherche est instantanée.",
        ],
      },
      {
        title: "Consulter la fiche d'un client",
        content: [
          "Cliquez sur un client dans la liste pour voir sa fiche complète. Vous y retrouvez toutes ses coordonnées, ainsi que l'historique de ses devis, factures et interventions.",
          "💡 Ajoutez des notes sur chaque client pour vous souvenir des détails importants : type de logement, accès particulier, préférences...",
        ],
      },
    ],
  },
  {
    id: "devis",
    iconKey: "FileText",
    title: "3. Devis",
    color: "text-indigo-500",
    subsections: [
      {
        title: "Créer un devis",
        content: [
          "Allez dans « Devis » puis cliquez sur « Nouveau devis ». Sélectionnez le client concerné, indiquez l'objet des travaux et la date de validité.",
        ],
      },
      {
        title: "Ajouter des lignes depuis la bibliothèque d'articles",
        content: [
          "Pour chaque ligne du devis, vous pouvez :",
          "• Saisir manuellement une désignation, une quantité et un prix",
          "• Rechercher un article dans la bibliothèque intégrée (des centaines d'articles plomberie, électricité, chauffage avec des prix de référence)",
          "Les totaux HT, TVA et TTC sont calculés automatiquement à chaque modification.",
        ],
      },
      {
        title: "Envoyer un devis par email",
        content: [
          "Depuis la fiche du devis, cliquez sur « Envoyer au client ». Le client recevra un email avec un lien sécurisé pour consulter le devis en ligne. Il pourra l'accepter ou le refuser directement depuis ce lien.",
        ],
      },
      {
        title: "Suivre les statuts",
        content: [
          "Chaque devis passe par plusieurs étapes :",
          "• Brouillon — Le devis est en cours de rédaction",
          "• Envoyé — Le client a reçu le devis",
          "• Accepté — Le client a accepté et signé en ligne",
          "• Refusé — Le client a décliné le devis",
        ],
      },
      {
        title: "Convertir un devis en facture",
        content: [
          "Quand un devis est accepté, vous pouvez le convertir en facture en un clic. Toutes les lignes et les montants sont automatiquement repris.",
          "💡 Envoyez vos devis rapidement après la visite. Un devis envoyé dans les 24h a beaucoup plus de chances d'être accepté.",
        ],
      },
    ],
  },
  {
    id: "factures",
    iconKey: "Receipt",
    title: "4. Factures",
    color: "text-amber-500",
    subsections: [
      {
        title: "Créer une facture",
        content: [
          "Vous pouvez créer une facture de deux façons :",
          "• Depuis un devis accepté : cliquez sur « Convertir en facture » dans la fiche du devis",
          "• Depuis zéro : allez dans « Factures » et créez une nouvelle facture manuellement",
          "Le numéro de facture est généré automatiquement (FAC-00001, FAC-00002, etc.).",
        ],
      },
      {
        title: "Envoyer une facture par email",
        content: [
          "Envoyez la facture par email directement depuis l'application. Le client reçoit un PDF professionnel avec toutes les informations légales.",
        ],
      },
      {
        title: "Activer le paiement en ligne",
        content: [
          "Si le paiement en ligne est activé (via Stripe), vos clients peuvent payer leur facture directement depuis le lien reçu par email. Le paiement est sécurisé et le statut de la facture est mis à jour automatiquement.",
        ],
      },
      {
        title: "Suivre les paiements et relancer les impayés",
        content: [
          "Les statuts de vos factures :",
          "• Brouillon — En cours de rédaction",
          "• Envoyée — Le client a reçu la facture",
          "• Payée — Le paiement a été reçu",
          "• En retard — La date d'échéance est dépassée",
          "💡 Activez les relances automatiques pour recevoir des alertes quand une facture dépasse sa date d'échéance.",
        ],
      },
    ],
  },
  {
    id: "interventions",
    iconKey: "Wrench",
    title: "5. Interventions",
    color: "text-orange-500",
    subsections: [
      {
        title: "Planifier une intervention",
        content: [
          "Allez dans « Interventions » et cliquez sur « Nouvelle intervention ». Sélectionnez le client, donnez un titre, une description, et choisissez la date et l'heure de début et de fin.",
        ],
      },
      {
        title: "Suivre les interventions",
        content: [
          "Chaque intervention a un statut :",
          "• Planifiée — L'intervention est prévue à une date future",
          "• En cours — Vous êtes actuellement sur le chantier",
          "• Terminée — Le travail est fait",
          "• Annulée — L'intervention a été annulée",
          "Vous pouvez aussi consulter vos interventions dans le calendrier pour avoir une vue d'ensemble de votre planning.",
          "💡 Liez vos interventions à un devis ou une facture pour garder une traçabilité complète de chaque chantier.",
        ],
      },
    ],
  },
  {
    id: "commandes",
    iconKey: "ShoppingCart",
    title: "6. Bons de commande fournisseurs",
    color: "text-purple-500",
    subsections: [
      {
        title: "Créer un bon de commande",
        content: [
          "Allez dans « Commandes » et cliquez sur « Nouvelle commande ». Sélectionnez le fournisseur concerné, puis ajoutez les articles à commander.",
        ],
      },
      {
        title: "Ajouter des articles depuis la bibliothèque",
        content: [
          "Pour chaque ligne, vous pouvez :",
          "• Rechercher un article dans la bibliothèque intégrée",
          "• Saisir manuellement une désignation et un prix d'achat",
          "Le prix d'achat est automatiquement renseigné si l'article est déjà référencé chez ce fournisseur.",
        ],
      },
      {
        title: "Envoyer le bon de commande au fournisseur",
        content: [
          "Depuis la fiche de la commande, cliquez sur « Envoyer ». Le fournisseur recevra le bon de commande en PDF par email. Le statut passe automatiquement à « Envoyée ».",
        ],
      },
      {
        title: "Suivre les statuts de commande",
        content: [
          "• Brouillon — Commande en préparation",
          "• Envoyée — Envoyée au fournisseur",
          "• Confirmée — Le fournisseur a confirmé la commande",
          "• Livrée — Vous avez reçu la marchandise",
          "💡 Vérifiez régulièrement vos alertes de stock bas. Elles vous indiquent quand il est temps de passer commande.",
        ],
      },
    ],
  },
  {
    id: "stocks",
    iconKey: "Package",
    title: "7. Stocks",
    color: "text-teal-500",
    subsections: [
      {
        title: "Gérer les articles en stock",
        content: [
          "La page « Stocks » vous permet de suivre tous vos articles : quantité en stock, prix d'achat, emplacement dans votre atelier ou camion, et fournisseur habituel.",
          "Pour chaque article, vous définissez un seuil d'alerte. Quand la quantité descend en dessous de ce seuil, une alerte apparaît sur le tableau de bord.",
        ],
      },
      {
        title: "Comprendre les alertes de stock bas",
        content: [
          "Les articles en alerte sont ceux dont la quantité en stock est inférieure ou égale au seuil d'alerte que vous avez défini. Ils apparaissent en rouge dans la liste et sont signalés sur le tableau de bord.",
          "💡 Mettez à jour vos stocks après chaque intervention. Cela vous évitera de vous retrouver en rupture sur un chantier.",
        ],
      },
    ],
  },
  {
    id: "assistant",
    iconKey: "Sparkles",
    title: "8. Assistant IA",
    color: "text-violet-500",
    subsections: [
      {
        title: "Poser une question à MonAssistant",
        content: [
          "MonAssistant est votre assistant intelligent. Cliquez sur « MonAssistant » dans le menu pour accéder à la conversation. Vous pouvez lui poser n'importe quelle question sur votre activité :",
          "• « Combien ai-je facturé ce mois-ci ? »",
          "• « Quelles sont mes interventions de demain ? »",
          "• « Quels clients n'ont pas payé ? »",
        ],
      },
      {
        title: "Utiliser les actions rapides",
        content: [
          "L'assistant propose des boutons d'action rapide :",
          "• Générer un devis — Décrivez les travaux et l'IA propose un devis chiffré avec les bons articles",
          "• Suggestions de relance — L'IA identifie les devis en attente à relancer en priorité",
          "• Analyse de rentabilité — Évaluez la marge sur un devis",
          "• Prédiction de trésorerie — Anticipez vos rentrées d'argent",
          "• Résumé du jour — Obtenez un récapitulatif complet de votre journée",
          "💡 Utilisez le résumé du jour chaque matin pour organiser votre journée efficacement.",
        ],
      },
    ],
  },
  {
    id: "portail",
    iconKey: "Globe",
    title: "9. Portail client",
    color: "text-cyan-500",
    subsections: [
      {
        title: "Le portail, c'est quoi ?",
        content: [
          "Le portail client est un espace en ligne dédié à chaque client. Il y accède via un lien sécurisé envoyé par email. Aucune inscription n'est nécessaire pour votre client.",
        ],
      },
      {
        title: "Ce que voit votre client",
        content: [
          "Depuis son portail, votre client peut :",
          "• Consulter ses devis et les accepter ou refuser en ligne",
          "• Voir ses factures et les payer en ligne",
          "• Suivre l'avancement de ses chantiers",
          "• Prendre rendez-vous directement via le calendrier",
          "💡 Parlez du portail client à vos clients. Cela vous fait gagner du temps et donne une image professionnelle et moderne de votre entreprise.",
        ],
      },
    ],
  },
  {
    id: "conseils",
    iconKey: "Lightbulb",
    title: "10. Conseils et bonnes pratiques",
    color: "text-yellow-500",
    subsections: [
      {
        title: "Votre routine quotidienne recommandée",
        content: [
          "Voici un workflow simple pour tirer le meilleur parti de Operioz au quotidien :",
          "• Le matin : consultez le résumé du jour via l'assistant IA pour voir vos interventions et vos priorités",
          "• Avant chaque intervention : vérifiez vos stocks pour ne rien oublier",
          "• Après chaque intervention : mettez à jour le statut de l'intervention et vos stocks",
          "• En fin de journée : envoyez les devis et factures en attente",
          "• Chaque semaine : vérifiez les factures impayées et lancez des relances",
        ],
      },
      {
        title: "Comment présenter l'app à vos clients",
        content: [
          "Operioz vous aide à donner une image professionnelle. Voici comment en parler à vos clients :",
          "• « Vous recevrez votre devis par email avec un lien pour l'accepter en un clic »",
          "• « Vous pourrez suivre l'avancement de vos travaux depuis votre espace en ligne »",
          "• « Vous pourrez payer vos factures en ligne de façon sécurisée »",
          "• « Vous pouvez prendre rendez-vous directement depuis mon site »",
        ],
      },
      {
        title: "En cas de question",
        content: [
          "Si vous avez une question sur l'utilisation de Operioz, utilisez l'assistant IA intégré. Il connaît toutes les fonctionnalités et peut vous guider pas à pas.",
        ],
      },
    ],
  },
];
