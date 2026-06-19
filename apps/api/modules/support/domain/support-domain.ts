export type SupportSujet = "technique" | "facturation" | "suggestion" | "autre";

export interface ContactSupportInput {
  readonly nom: string;
  readonly email: string;
  readonly sujet: SupportSujet;
  readonly message: string;
}
