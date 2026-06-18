import type { RouterInputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `client-form` (création d'un client). Type de formulaire, défauts, validation
// pure + construction du payload `clients.create`. 0 React/tRPC.

export type ClientCreateInput = RouterInputs["clients"]["create"];
export type ClientType = "particulier" | "professionnel";

export type ClientForm = {
  nom: string; prenom: string; email: string; telephone: string;
  adresse: string; codePostal: string; ville: string;
  adresseFacturation: string; codePostalFacturation: string; villeFacturation: string;
  type: ClientType; raisonSociale: string; siret: string; numeroTVA: string;
  notes: string; etiquettes: string;
};

export function defaultClientForm(): ClientForm {
  return {
    nom: "", prenom: "", email: "", telephone: "", adresse: "", codePostal: "", ville: "",
    adresseFacturation: "", codePostalFacturation: "", villeFacturation: "",
    type: "particulier", raisonSociale: "", siret: "", numeroTVA: "", notes: "", etiquettes: "",
  };
}

// Validation : le nom est requis. Renvoie une clé i18n d'erreur, ou null. PUR.
export function validateClientForm(form: ClientForm): string | null {
  return form.nom.trim() ? null : "errNom";
}

// Construit le payload `clients.create` depuis le formulaire (les champs vides sont acceptés nullish). PUR.
export function buildCreatePayload(form: ClientForm): ClientCreateInput {
  return form;
}
