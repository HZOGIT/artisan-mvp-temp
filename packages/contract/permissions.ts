export type PermissionCode =
  | "dashboard.voir" | "statistiques.voir"
  | "devis.voir" | "devis.creer" | "devis.supprimer"
  | "factures.voir" | "factures.creer" | "factures.supprimer"
  | "contrats.voir" | "contrats.gerer"
  | "relances.voir"
  | "clients.voir" | "clients.gerer"
  | "chat.voir"
  | "portail.gerer"
  | "rdv.gerer"
  | "interventions.voir" | "interventions.gerer"
  | "calendrier.voir"
  | "chantiers.voir" | "chantiers.gerer"
  | "techniciens.voir"
  | "geolocalisation.voir"
  | "articles.voir"
  | "comptabilite.voir"
  | "exports.voir"
  | "parametres.voir"
  | "utilisateurs.gerer"
  | "vitrine.gerer";

export interface PermissionGroup {
  label: string;
  permissions: { code: PermissionCode; label: string }[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: "Tableau de bord",
    permissions: [
      { code: "dashboard.voir", label: "Accéder au tableau de bord" },
      { code: "statistiques.voir", label: "Voir les statistiques" },
    ],
  },
  {
    label: "Commercial",
    permissions: [
      { code: "devis.voir", label: "Voir les devis" },
      { code: "devis.creer", label: "Créer et modifier des devis" },
      { code: "devis.supprimer", label: "Supprimer des devis" },
      { code: "factures.voir", label: "Voir les factures" },
      { code: "factures.creer", label: "Créer et modifier des factures" },
      { code: "factures.supprimer", label: "Supprimer des factures" },
      { code: "contrats.voir", label: "Voir les contrats" },
      { code: "contrats.gerer", label: "Créer et modifier des contrats" },
      { code: "relances.voir", label: "Voir et gérer les relances" },
    ],
  },
  {
    label: "Clients",
    permissions: [
      { code: "clients.voir", label: "Voir les clients" },
      { code: "clients.gerer", label: "Créer et modifier des clients" },
      { code: "chat.voir", label: "Accéder au chat" },
      { code: "portail.gerer", label: "Gérer le portail client" },
      { code: "rdv.gerer", label: "Gérer les RDV en ligne" },
    ],
  },
  {
    label: "Terrain",
    permissions: [
      { code: "interventions.voir", label: "Voir les interventions" },
      { code: "interventions.gerer", label: "Créer et modifier des interventions" },
      { code: "calendrier.voir", label: "Voir le calendrier" },
      { code: "chantiers.voir", label: "Voir les chantiers" },
      { code: "chantiers.gerer", label: "Modifier les chantiers" },
      { code: "techniciens.voir", label: "Voir les techniciens" },
      { code: "geolocalisation.voir", label: "Voir la géolocalisation" },
    ],
  },
  {
    label: "Gestion",
    permissions: [
      { code: "articles.voir", label: "Voir les articles et stocks" },
      { code: "comptabilite.voir", label: "Accéder à la comptabilité" },
      { code: "exports.voir", label: "Exporter FEC/CSV" },
    ],
  },
  {
    label: "Administration",
    permissions: [
      { code: "parametres.voir", label: "Accéder aux paramètres" },
      { code: "utilisateurs.gerer", label: "Gérer les utilisateurs" },
      { code: "vitrine.gerer", label: "Gérer la vitrine" },
    ],
  },
];

export const ALL_PERMISSIONS: PermissionCode[] = PERMISSION_GROUPS.flatMap(
  (g) => g.permissions.map((p) => p.code)
);

export const ROLE_TEMPLATES: Record<string, PermissionCode[]> = {
  admin: [...ALL_PERMISSIONS],
  artisan: ALL_PERMISSIONS.filter((p) => p !== "utilisateurs.gerer"),
  secretaire: [
    "dashboard.voir", "statistiques.voir",
    "devis.voir", "devis.creer", "devis.supprimer",
    "factures.voir", "factures.creer", "factures.supprimer",
    "contrats.voir", "relances.voir",
    "clients.voir", "clients.gerer",
    "chat.voir", "portail.gerer", "rdv.gerer",
  ],
  technicien: [
    "dashboard.voir",
    "interventions.voir", "interventions.gerer",
    "calendrier.voir",
    "chantiers.voir", "chantiers.gerer",
    "techniciens.voir",
    "geolocalisation.voir",
  ],
};
