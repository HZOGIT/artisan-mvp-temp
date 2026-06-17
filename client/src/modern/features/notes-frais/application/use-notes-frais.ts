import { trpc } from "@/modern/shared/trpc";
import { filterBrouillon, type NoteFrais, type NoteFraisDetail, type DepenseBrouillon } from "../domain/note-frais";

// Couche APPLICATION de la feature `notes-frais` (clean-archi) : SEULE couche important tRPC.
// Charge la liste (+ nbDepenses), le détail (+ depenses[], si `selectedId`), les dépenses brouillon
// ajoutables, et expose le workflow (create/soumettre/approuver/rejeter/payer) + liens dépense
// (add/remove). Invalidations ciblées ; les effets de présentation (toasts, dialogs) sont attachés
// par l'UI via `mutate(vars, { onSuccess, onError })`.
export function useNotesFrais(selectedId: number | null) {
  const utils = trpc.useUtils();
  const notesQ = trpc.depenses.listNotesFrais.useQuery();
  const detailQ = trpc.depenses.getNoteFraisById.useQuery({ id: selectedId ?? 0 }, { enabled: !!selectedId });
  // `depenses.list` new-stack n'a pas de filtre statut → on charge tout et on filtre les brouillons.
  const brouillonsQ = trpc.depenses.list.useQuery();

  const invalidateList = () => utils.depenses.listNotesFrais.invalidate();
  const invalidateDetail = () => { if (selectedId) utils.depenses.getNoteFraisById.invalidate({ id: selectedId }); };
  const invalidateBoth = () => { invalidateList(); invalidateDetail(); };

  const create = trpc.depenses.createNoteFrais.useMutation({ onSuccess: invalidateList });
  const soumettre = trpc.depenses.soumettreNoteFrais.useMutation({ onSuccess: invalidateBoth });
  const approuver = trpc.depenses.approuverNoteFrais.useMutation({ onSuccess: invalidateBoth });
  const rejeter = trpc.depenses.rejeterNoteFrais.useMutation({ onSuccess: invalidateBoth });
  const payer = trpc.depenses.payerNoteFrais.useMutation({ onSuccess: invalidateBoth });
  const addDep = trpc.depenses.addDepenseToNoteFrais.useMutation({ onSuccess: invalidateDetail });
  const removeDep = trpc.depenses.removeDepenseFromNoteFrais.useMutation({ onSuccess: invalidateDetail });

  const notes: NoteFrais[] = notesQ.data ?? [];
  const detail: NoteFraisDetail | null = detailQ.data ?? null;
  const depensesBrouillon: DepenseBrouillon[] = filterBrouillon(brouillonsQ.data ?? []);

  return { notes, detail, depensesBrouillon, create, soumettre, approuver, rejeter, payer, addDep, removeDep };
}
