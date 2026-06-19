import { trpc } from "@/shared/trpc";

/*
 * Couche APPLICATION — formulaires d'auth : expose les 4 mutations publiques (connexion, inscription,
 * mot de passe oublié, réinitialisation). SEULE couche important tRPC ; effets (toast, nav) gérés en UI.
 */
export function useAuthForms() {
  return {
    signin: trpc.auth.signin.useMutation(),
    signup: trpc.auth.signup.useMutation(),
    forgotPassword: trpc.auth.forgotPassword.useMutation(),
    resetPassword: trpc.auth.resetPassword.useMutation(),
  };
}
