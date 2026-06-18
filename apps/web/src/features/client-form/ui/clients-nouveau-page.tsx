import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { useCreateClient } from "../application/use-create-client";
import { defaultClientForm, validateClientForm, buildCreatePayload, type ClientForm } from "../domain/client-form";

const INPUT_CLASS = "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500";

// Page `/clients/nouveau` — migration clean-archi de `pages/ClientsNouveauPage.tsx`. Markup à
// l'identique (inputs natifs conservés). Validation + payload en domain ; mutation via `use-create-client`.
export default function ClientsNouveauPage() {
  const { t } = useTranslation("clientForm");
  const [form, setForm] = useState<ClientForm>(defaultClientForm);
  const create = useCreateClient();

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const cancel = () => { window.location.href = "/clients"; };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateClientForm(form);
    if (err) { toast.error(t(err)); return; }
    create.mutate(buildCreatePayload(form), {
      onSuccess: () => { toast.success(t("toastCree")); window.location.href = "/clients"; },
      onError: (error) => toast.error(error.message || t("errCreation")),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={cancel} className="gap-2"><ArrowLeft className="w-4 h-4" />{t("retour")}</Button>
        <div>
          <h1 className="text-3xl font-bold">{t("titre")}</h1>
          <p className="text-gray-600">{t("sousTitre")}</p>
        </div>
      </div>

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg border">
          <div>
            <Label htmlFor="type" className="block text-sm font-medium mb-2">{t("typeClient")}</Label>
            <select id="type" name="type" value={form.type} onChange={onChange} className={INPUT_CLASS}>
              <option value="particulier">{t("particulier")}</option>
              <option value="professionnel">{t("professionnel")}</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="nom" className="block text-sm font-medium mb-2">{t("nom")}</Label>
              <input id="nom" type="text" name="nom" value={form.nom} onChange={onChange} required className={INPUT_CLASS} placeholder={t("nomPlaceholder")} />
            </div>
            <div>
              <Label htmlFor="prenom" className="block text-sm font-medium mb-2">{t("prenom")}</Label>
              <input id="prenom" type="text" name="prenom" value={form.prenom} onChange={onChange} className={INPUT_CLASS} placeholder={t("prenomPlaceholder")} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email" className="block text-sm font-medium mb-2">{t("email")}</Label>
              <input id="email" type="email" inputMode="email" autoComplete="email" name="email" value={form.email} onChange={onChange} className={INPUT_CLASS} placeholder={t("emailPlaceholder")} />
            </div>
            <div>
              <Label htmlFor="telephone" className="block text-sm font-medium mb-2">{t("telephone")}</Label>
              <input id="telephone" type="tel" inputMode="tel" autoComplete="tel" name="telephone" value={form.telephone} onChange={onChange} className={INPUT_CLASS} placeholder={t("telephonePlaceholder")} />
            </div>
          </div>

          <div>
            <Label htmlFor="adresse" className="block text-sm font-medium mb-2">{t("adresse")}</Label>
            <input id="adresse" type="text" name="adresse" value={form.adresse} onChange={onChange} className={INPUT_CLASS} placeholder={t("adressePlaceholder")} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="codePostal" className="block text-sm font-medium mb-2">{t("codePostal")}</Label>
              <input id="codePostal" type="text" name="codePostal" value={form.codePostal} onChange={onChange} className={INPUT_CLASS} placeholder="75001" maxLength={5} />
            </div>
            <div>
              <Label htmlFor="ville" className="block text-sm font-medium mb-2">{t("ville")}</Label>
              <input id="ville" type="text" name="ville" value={form.ville} onChange={onChange} className={INPUT_CLASS} placeholder={t("villePlaceholder")} />
            </div>
          </div>

          <div className="space-y-4 rounded-md border border-gray-200 p-4">
            <p className="text-sm font-medium text-gray-700">{t("adresseFacturationTitre")} <span className="font-normal text-muted-foreground">{t("adresseFacturationHint")}</span></p>
            <div>
              <Label htmlFor="adresseFacturation" className="block text-sm font-medium mb-2">{t("adresseFacturation")}</Label>
              <input id="adresseFacturation" type="text" name="adresseFacturation" value={form.adresseFacturation} onChange={onChange} className={INPUT_CLASS} placeholder={t("adresseFacturationPlaceholder")} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="codePostalFacturation" className="block text-sm font-medium mb-2">{t("codePostalFacturation")}</Label>
                <input id="codePostalFacturation" type="text" name="codePostalFacturation" value={form.codePostalFacturation} onChange={onChange} maxLength={5} className={INPUT_CLASS} />
              </div>
              <div>
                <Label htmlFor="villeFacturation" className="block text-sm font-medium mb-2">{t("villeFacturation")}</Label>
                <input id="villeFacturation" type="text" name="villeFacturation" value={form.villeFacturation} onChange={onChange} className={INPUT_CLASS} />
              </div>
            </div>
          </div>

          {form.type === "professionnel" && (
            <div className="space-y-4 rounded-md border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-700">{t("infosPro")}</p>
              <div>
                <Label htmlFor="raisonSociale" className="block text-sm font-medium mb-2">{t("raisonSociale")}</Label>
                <input id="raisonSociale" type="text" name="raisonSociale" value={form.raisonSociale} onChange={onChange} className={INPUT_CLASS} placeholder={t("raisonSocialePlaceholder")} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="siret" className="block text-sm font-medium mb-2">{t("siret")}</Label>
                  <input id="siret" type="text" name="siret" value={form.siret} onChange={onChange} className={INPUT_CLASS} placeholder="12345678900012" maxLength={14} />
                </div>
                <div>
                  <Label htmlFor="numeroTVA" className="block text-sm font-medium mb-2">{t("numeroTVA")}</Label>
                  <input id="numeroTVA" type="text" name="numeroTVA" value={form.numeroTVA} onChange={onChange} className={INPUT_CLASS} placeholder="FR00123456789" maxLength={20} />
                </div>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="etiquettes" className="block text-sm font-medium mb-2">{t("etiquettes")}</Label>
            <input id="etiquettes" name="etiquettes" type="text" value={form.etiquettes} onChange={onChange} className={INPUT_CLASS} placeholder={t("etiquettesPlaceholder")} />
            <p className="text-xs text-gray-500 mt-1">{t("etiquettesHint")}</p>
          </div>

          <div>
            <Label htmlFor="notes" className="block text-sm font-medium mb-2">{t("notes")}</Label>
            <textarea id="notes" name="notes" value={form.notes} onChange={onChange} className={INPUT_CLASS} placeholder={t("notesPlaceholder")} rows={4} />
          </div>

          <div className="flex gap-4 justify-end pt-4">
            <Button type="button" variant="outline" onClick={cancel}>{t("annuler")}</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? t("creation") : t("creer")}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
