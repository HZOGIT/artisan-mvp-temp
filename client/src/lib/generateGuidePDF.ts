import jsPDF from "jspdf";

export function generateGuidePDF() {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const margin = 20;
  const contentW = W - margin * 2;
  let y = 0;

  const blue = [37, 99, 235];
  const dark = [30, 30, 30];
  const gray = [100, 100, 100];

  function setColor(c: number[]) { doc.setTextColor(c[0], c[1], c[2]); }
  function addPage() { doc.addPage(); y = margin; }

  function checkSpace(needed: number) {
    if (y + needed > 275) addPage();
  }

  function heading1(text: string) {
    checkSpace(18);
    setColor(blue);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(text, margin, y);
    y += 4;
    doc.setDrawColor(blue[0], blue[1], blue[2]);
    doc.setLineWidth(0.5);
    doc.line(margin, y, W - margin, y);
    y += 10;
  }

  function heading2(text: string) {
    checkSpace(14);
    setColor(dark);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(text, margin, y);
    y += 8;
  }

  function paragraph(text: string) {
    checkSpace(10);
    setColor(dark);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(text, contentW);
    for (const line of lines) {
      checkSpace(6);
      doc.text(line, margin, y);
      y += 5;
    }
    y += 3;
  }

  function bullet(text: string) {
    checkSpace(8);
    setColor(dark);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("•", margin + 2, y);
    const lines = doc.splitTextToSize(text, contentW - 8);
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) checkSpace(5);
      doc.text(lines[i], margin + 8, y);
      if (i < lines.length - 1) y += 5;
    }
    y += 6;
  }

  function tip(text: string) {
    checkSpace(14);
    doc.setFillColor(240, 249, 255);
    doc.setDrawColor(37, 99, 235);
    const lines = doc.splitTextToSize(text, contentW - 16);
    const h = lines.length * 5 + 8;
    doc.roundedRect(margin, y - 4, contentW, h, 2, 2, "FD");
    setColor(blue);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bolditalic");
    doc.text("Conseil :", margin + 4, y + 1);
    doc.setFont("helvetica", "italic");
    setColor(dark);
    for (let i = 0; i < lines.length; i++) {
      doc.text(lines[i], margin + 4, y + 1 + (i > 0 ? 5 * i : 0));
    }
    y += h + 4;
  }

  // ========== PAGE DE COUVERTURE ==========
  doc.setFillColor(blue[0], blue[1], blue[2]);
  doc.rect(0, 0, W, 297, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(36);
  doc.setFont("helvetica", "bold");
  doc.text("MonArtisan Pro", W / 2, 100, { align: "center" });

  doc.setFontSize(20);
  doc.setFont("helvetica", "normal");
  doc.text("Guide Utilisateur", W / 2, 120, { align: "center" });

  doc.setFontSize(12);
  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  doc.text(`Version 1.0 — ${today}`, W / 2, 145, { align: "center" });

  doc.setFontSize(10);
  doc.text("artisan.cheminov.com", W / 2, 250, { align: "center" });

  // ========== SOMMAIRE ==========
  addPage();
  heading1("Sommaire");

  const sommaire = [
    "1. Premiers pas",
    "2. Clients",
    "3. Devis",
    "4. Factures",
    "5. Interventions",
    "6. Bons de commande fournisseurs",
    "7. Stocks",
    "8. Assistant IA",
    "9. Portail client",
    "10. Conseils et bonnes pratiques",
  ];

  for (const item of sommaire) {
    setColor(dark);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(item, margin + 5, y);
    y += 9;
  }

  // ========== 1. PREMIERS PAS ==========
  addPage();
  heading1("1. Premiers pas");

  heading2("Se connecter");
  paragraph("Rendez-vous sur artisan.cheminov.com et cliquez sur « Se connecter ». Saisissez votre adresse email et votre mot de passe. Vous arrivez directement sur le tableau de bord.");

  heading2("Le tableau de bord");
  paragraph("Le tableau de bord est votre page d'accueil. Vous y trouvez en un coup d'œil :");
  bullet("Le nombre de devis et factures en cours");
  bullet("Le chiffre d'affaires du mois");
  bullet("Les interventions prévues aujourd'hui");
  bullet("Les alertes importantes (factures impayées, stocks bas)");
  bullet("L'activité récente de votre entreprise");

  heading2("Configurer votre profil");
  paragraph("Allez dans « Mon profil » depuis le menu à gauche. Complétez les informations de votre entreprise : nom, SIRET, adresse, téléphone, email. Ces informations apparaîtront sur vos devis et factures.");

  tip("Pensez à ajouter votre logo dans les paramètres. Il apparaîtra sur tous vos documents PDF.");

  heading2("Les paramètres");
  paragraph("Dans « Paramètres », vous pouvez personnaliser :");
  bullet("Les préfixes de numérotation (DEV- pour les devis, FAC- pour les factures)");
  bullet("Les mentions légales affichées sur vos documents");
  bullet("Les conditions de règlement par défaut");
  bullet("Votre taux de TVA habituel");

  // ========== 2. CLIENTS ==========
  addPage();
  heading1("2. Clients");

  heading2("Ajouter un client");
  paragraph("Cliquez sur « Clients » dans le menu, puis sur le bouton « Nouveau client ». Remplissez au minimum le nom et l'email. Vous pouvez aussi ajouter le téléphone, l'adresse et des notes personnelles.");

  heading2("Rechercher un client");
  paragraph("Utilisez la barre de recherche en haut de la liste pour trouver rapidement un client par son nom, prénom ou email. La recherche est instantanée.");

  heading2("Consulter la fiche d'un client");
  paragraph("Cliquez sur un client dans la liste pour voir sa fiche complète. Vous y retrouvez toutes ses coordonnées, ainsi que l'historique de ses devis, factures et interventions.");

  tip("Ajoutez des notes sur chaque client pour vous souvenir des détails importants : type de logement, accès particulier, préférences...");

  // ========== 3. DEVIS ==========
  addPage();
  heading1("3. Devis");

  heading2("Créer un devis");
  paragraph("Allez dans « Devis » puis cliquez sur « Nouveau devis ». Sélectionnez le client concerné, indiquez l'objet des travaux et la date de validité.");

  heading2("Ajouter des lignes");
  paragraph("Pour chaque ligne du devis, vous pouvez :");
  bullet("Saisir manuellement une désignation, une quantité et un prix");
  bullet("Rechercher un article dans la bibliothèque intégrée (des centaines d'articles plomberie, électricité, chauffage avec des prix de référence)");
  paragraph("Les totaux HT, TVA et TTC sont calculés automatiquement à chaque modification.");

  heading2("Envoyer un devis");
  paragraph("Depuis la fiche du devis, cliquez sur « Envoyer au client ». Le client recevra un email avec un lien sécurisé pour consulter le devis en ligne. Il pourra l'accepter ou le refuser directement depuis ce lien.");

  heading2("Suivre les statuts");
  paragraph("Chaque devis passe par plusieurs étapes :");
  bullet("Brouillon : le devis est en cours de rédaction");
  bullet("Envoyé : le client a reçu le devis");
  bullet("Accepté : le client a accepté et signé en ligne");
  bullet("Refusé : le client a décliné le devis");

  heading2("Convertir en facture");
  paragraph("Quand un devis est accepté, vous pouvez le convertir en facture en un clic. Toutes les lignes et les montants sont automatiquement repris.");

  tip("Envoyez vos devis rapidement après la visite. Un devis envoyé dans les 24h a beaucoup plus de chances d'être accepté.");

  // ========== 4. FACTURES ==========
  addPage();
  heading1("4. Factures");

  heading2("Créer une facture");
  paragraph("Vous pouvez créer une facture de deux façons :");
  bullet("Depuis un devis accepté : cliquez sur « Convertir en facture » dans la fiche du devis");
  bullet("Depuis zéro : allez dans « Factures » et créez une nouvelle facture manuellement");
  paragraph("Le numéro de facture est généré automatiquement (FAC-00001, FAC-00002, etc.).");

  heading2("Envoyer une facture");
  paragraph("Envoyez la facture par email directement depuis l'application. Le client reçoit un PDF professionnel avec toutes les informations légales.");

  heading2("Paiement en ligne");
  paragraph("Si le paiement en ligne est activé (via Stripe), vos clients peuvent payer leur facture directement depuis le lien reçu par email. Le paiement est sécurisé et le statut de la facture est mis à jour automatiquement.");

  heading2("Suivre les paiements");
  paragraph("Les statuts de vos factures :");
  bullet("Brouillon : en cours de rédaction");
  bullet("Envoyée : le client a reçu la facture");
  bullet("Payée : le paiement a été reçu");
  bullet("En retard : la date d'échéance est dépassée");

  tip("Activez les relances automatiques pour recevoir des alertes quand une facture dépasse sa date d'échéance.");

  // ========== 5. INTERVENTIONS ==========
  addPage();
  heading1("5. Interventions");

  heading2("Planifier une intervention");
  paragraph("Allez dans « Interventions » et cliquez sur « Nouvelle intervention ». Sélectionnez le client, donnez un titre, une description, et choisissez la date et l'heure de début et de fin.");

  heading2("Suivre les interventions");
  paragraph("Chaque intervention a un statut :");
  bullet("Planifiée : l'intervention est prévue à une date future");
  bullet("En cours : vous êtes actuellement sur le chantier");
  bullet("Terminée : le travail est fait");
  bullet("Annulée : l'intervention a été annulée");

  paragraph("Vous pouvez aussi consulter vos interventions dans le calendrier pour avoir une vue d'ensemble de votre planning.");

  tip("Liez vos interventions à un devis ou une facture pour garder une traçabilité complète de chaque chantier.");

  // ========== 6. BONS DE COMMANDE ==========
  addPage();
  heading1("6. Bons de commande fournisseurs");

  heading2("Créer un bon de commande");
  paragraph("Allez dans « Commandes » et cliquez sur « Nouvelle commande ». Sélectionnez le fournisseur concerné, puis ajoutez les articles à commander.");

  heading2("Ajouter des articles");
  paragraph("Pour chaque ligne, vous pouvez :");
  bullet("Rechercher un article dans la bibliothèque intégrée");
  bullet("Saisir manuellement une désignation et un prix d'achat");
  paragraph("Le prix d'achat est automatiquement renseigné si l'article est déjà référencé chez ce fournisseur.");

  heading2("Envoyer au fournisseur");
  paragraph("Depuis la fiche de la commande, cliquez sur « Envoyer ». Le fournisseur recevra le bon de commande en PDF par email. Le statut passe automatiquement à « Envoyée ».");

  heading2("Suivre les commandes");
  bullet("Brouillon : commande en préparation");
  bullet("Envoyée : envoyée au fournisseur");
  bullet("Confirmée : le fournisseur a confirmé la commande");
  bullet("Livrée : vous avez reçu la marchandise");

  tip("Vérifiez régulièrement vos alertes de stock bas. Elles vous indiquent quand il est temps de passer commande.");

  // ========== 7. STOCKS ==========
  addPage();
  heading1("7. Stocks");

  heading2("Gérer vos articles en stock");
  paragraph("La page « Stocks » vous permet de suivre tous vos articles : quantité en stock, prix d'achat, emplacement dans votre atelier ou camion, et fournisseur habituel.");
  paragraph("Pour chaque article, vous définissez un seuil d'alerte. Quand la quantité descend en dessous de ce seuil, une alerte apparaît sur le tableau de bord.");

  heading2("Mouvements de stock");
  paragraph("Vous pouvez enregistrer les entrées (réapprovisionnement) et les sorties (utilisation sur chantier) pour garder vos quantités à jour.");

  tip("Mettez à jour vos stocks après chaque intervention. Cela vous évitera de vous retrouver en rupture sur un chantier.");

  // ========== 8. ASSISTANT IA ==========
  addPage();
  heading1("8. Assistant IA");

  heading2("Poser une question");
  paragraph("MonAssistant est votre assistant intelligent. Cliquez sur « MonAssistant » dans le menu pour accéder à la conversation. Vous pouvez lui poser n'importe quelle question sur votre activité :");
  bullet("« Combien ai-je facturé ce mois-ci ? »");
  bullet("« Quelles sont mes interventions de demain ? »");
  bullet("« Quels clients n'ont pas payé ? »");

  heading2("Actions rapides");
  paragraph("L'assistant propose des boutons d'action rapide :");
  bullet("Générer un devis : décrivez les travaux et l'IA propose un devis chiffré avec les bons articles");
  bullet("Suggestions de relance : l'IA identifie les devis en attente à relancer en priorité");
  bullet("Analyse de rentabilité : évaluez la marge sur un devis");
  bullet("Prédiction de trésorerie : anticipez vos rentrées d'argent");
  bullet("Résumé du jour : obtenez un récapitulatif complet de votre journée");

  tip("Utilisez le résumé du jour chaque matin pour organiser votre journée efficacement.");

  // ========== 9. PORTAIL CLIENT ==========
  addPage();
  heading1("9. Portail client");

  heading2("Le portail, c'est quoi ?");
  paragraph("Le portail client est un espace en ligne dédié à chaque client. Il y accède via un lien sécurisé envoyé par email. Aucune inscription n'est nécessaire pour votre client.");

  heading2("Ce que voit votre client");
  paragraph("Depuis son portail, votre client peut :");
  bullet("Consulter ses devis et les accepter ou refuser en ligne");
  bullet("Voir ses factures et les payer en ligne");
  bullet("Suivre l'avancement de ses chantiers");
  bullet("Prendre rendez-vous directement via le calendrier");

  tip("Parlez du portail client à vos clients. Cela vous fait gagner du temps et donne une image professionnelle et moderne de votre entreprise.");

  // ========== 10. CONSEILS ==========
  addPage();
  heading1("10. Conseils et bonnes pratiques");

  heading2("Votre routine quotidienne recommandée");
  paragraph("Voici un workflow simple pour tirer le meilleur parti de MonArtisan Pro au quotidien :");
  bullet("Le matin : consultez le résumé du jour via l'assistant IA pour voir vos interventions et vos priorités");
  bullet("Avant chaque intervention : vérifiez vos stocks pour ne rien oublier");
  bullet("Après chaque intervention : mettez à jour le statut de l'intervention et vos stocks");
  bullet("En fin de journée : envoyez les devis et factures en attente");
  bullet("Chaque semaine : vérifiez les factures impayées et lancez des relances");

  heading2("Présentez l'app à vos clients");
  paragraph("MonArtisan Pro vous aide à donner une image professionnelle. Voici comment en parler à vos clients :");
  bullet("« Vous recevrez votre devis par email avec un lien pour l'accepter en un clic »");
  bullet("« Vous pourrez suivre l'avancement de vos travaux depuis votre espace en ligne »");
  bullet("« Vous pourrez payer vos factures en ligne de façon sécurisée »");
  bullet("« Vous pouvez prendre rendez-vous directement depuis mon site »");

  heading2("En cas de question");
  paragraph("Si vous avez une question sur l'utilisation de MonArtisan Pro, utilisez l'assistant IA intégré. Il connaît toutes les fonctionnalités et peut vous guider pas à pas.");

  // ========== FOOTER sur chaque page ==========
  const pageCount = doc.getNumberOfPages();
  for (let i = 2; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("MonArtisan Pro — Guide Utilisateur", margin, 290);
    doc.text(`Page ${i - 1} / ${pageCount - 1}`, W - margin, 290, { align: "right" });
  }

  doc.save("guide-utilisateur-monartisan-pro.pdf");
}
