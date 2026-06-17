// Couche DOMAINE de la feature `support` (centre d'aide / formulaire de contact) (clean-archi) :
// règles PURES testables sans réseau ni i18n.

export const SUJETS = ["technique", "facturation", "suggestion", "autre"] as const;
export type Sujet = (typeof SUJETS)[number];

export interface ContactForm {
  nom: string;
  email: string;
  sujet: string;
  message: string;
}

// Validation PURE du formulaire de contact : nom + email + message requis (mêmes règles que le legacy).
export function isContactValid(form: Pick<ContactForm, "nom" | "email" | "message">): boolean {
  return form.nom.trim().length > 0 && form.email.trim().length > 0 && form.message.trim().length > 0;
}
