import { useState, useRef, useEffect } from "react";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Button } from "@/modern/shared/ui/button";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Separator } from "@/modern/shared/ui/separator";
import { Textarea } from "@/modern/shared/ui/textarea";
import { Checkbox } from "@/modern/shared/ui/checkbox";
import { trpc } from "@/modern/shared/trpc";
import { Loader2, Check, Building2, User, Pen, AlertCircle, Download, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { generateDevisPDF } from "@/lib/pdfGenerator";

// Page PUBLIQUE de signature de devis du FRONT NEUF (`/v2/signature/:token`) — PORT CONFORME de
// `pages/SignatureDevis.tsx`. Montée hors auth (cf. public-router). JSX/canvas copiés à l'identique ;
// plomberie repointée : primitives `@/modern/shared/ui`, tRPC partagé, i18n (namespace `signature`),
// token de route via TanStack. Libellés legacy (sans accents) conservés à l'identique pour la parité.

export default function SignatureDevisPage() {
  const { t } = useTranslation("signature");
  const { token } = useParams({ strict: false }) as { token?: string };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signataireName, setSignataireName] = useState("");
  const [signataireEmail, setSignataireEmail] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isRefusing, setIsRefusing] = useState(false);
  const [showRefuseForm, setShowRefuseForm] = useState(false);
  const [motifRefus, setMotifRefus] = useState("");
  const [actionComplete, setActionComplete] = useState<"accepte" | "refuse" | null>(null);

  const { data, isLoading, error } = trpc.signature.getDevisForSignature.useQuery(
    { token: token || "" },
    { enabled: !!token }
  );

  // Pré-remplit l'email depuis les données client au chargement.
  useEffect(() => {
    if (data?.client?.email && !signataireEmail) {
      setSignataireEmail(data.client.email);
    }
  }, [data]);

  const signMutation = trpc.signature.signDevis.useMutation({
    onSuccess: () => {
      setActionComplete("accepte");
      toast.success(t("toastSigned"));
    },
    onError: (err) => {
      toast.error(err.message);
      setIsSigning(false);
    }
  });

  const refuseMutation = trpc.signature.refuseDevis.useMutation({
    onSuccess: () => {
      setActionComplete("refuse");
      toast.success(t("toastRefused"));
    },
    onError: (err) => {
      toast.error(err.message);
      setIsRefusing(false);
    }
  });

  const utils = trpc.useUtils();
  const selectOptionMutation = trpc.signature.selectDevisOption.useMutation({
    onSuccess: () => {
      utils.signature.getDevisForSignature.invalidate({ token: token || "" });
      toast.success(t("toastOptionSelected"));
    },
    onError: (err) => {
      toast.error(err.message);
    }
  });

  // Canvas setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = 200;
    ctx.strokeStyle = "#1e40af";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [data, showRefuseForm]);

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = canvas.offsetWidth;
      canvas.height = 200;
      ctx.putImageData(imageData, 0, 0);
      ctx.strokeStyle = "#1e40af";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    setHasSignature(true);
    const { x, y } = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if ("touches" in e) e.preventDefault();
    const { x, y } = getCanvasPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSign = () => {
    if (!hasSignature || !signataireName || !signataireEmail || !token || !accepted) {
      toast.error(t("toastFillAll"));
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsSigning(true);
    const signatureData = canvas.toDataURL("image/png");
    signMutation.mutate({ token, signatureData, signataireName, signataireEmail });
  };

  const handleRefuse = () => {
    if (!token) return;
    setIsRefusing(true);
    refuseMutation.mutate({ token, motifRefus: motifRefus || undefined });
  };

  const handleDownloadPDF = () => {
    if (!data) return;
    const { devis: d, artisan: a, client: c, lignes: l } = data;
    const lignesPDF = (l || []).map((ligne: any) => ({
      designation: ligne.designation,
      description: ligne.description,
      quantite: parseFloat(ligne.quantite) || 1,
      unite: ligne.unite,
      prixUnitaire: parseFloat(ligne.prixUnitaireHT) || 0,
      tauxTva: parseFloat(ligne.tauxTVA) || 20,
    }));
    generateDevisPDF((a || {}) as any, (c || {}) as any, {
      numero: d.numero,
      dateCreation: d.createdAt,
      dateValidite: d.dateValidite,
      statut: d.statut || "brouillon",
      objet: d.objet,
      lignes: lignesPDF,
      totalHT: parseFloat(d.totalHT as any) || 0,
      totalTVA: parseFloat(d.totalTVA as any) || 0,
      totalTTC: parseFloat(d.totalTTC as any) || 0,
      conditions: (d as any).conditionsPaiement || null,
    });
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(num);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-red-500">
              <AlertCircle className="h-6 w-6" />
              <CardTitle>{t("lienInvalide")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (actionComplete) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className={`flex items-center gap-2 ${actionComplete === "accepte" ? "text-green-500" : "text-red-500"}`}>
              {actionComplete === "accepte" ? <Check className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
              <CardTitle>{actionComplete === "accepte" ? t("devisAccepteSigne") : t("devisRefuse")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              <span>{t("leDevis")} <strong>{data?.devis.numero}</strong> {actionComplete === "accepte" ? t("confirmAccepteSuffix") : t("confirmRefuseSuffix")}</span>
            </p>
            <p className="text-sm text-muted-foreground">{t("fermerPage")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const { devis, artisan, client, lignes, signature } = data;
  const options = (data as any).options || [];
  const isAlreadyProcessed = signature.statut === "accepte" || signature.statut === "refuse";

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="text-2xl">{t("devisNum", { numero: devis.numero })}</CardTitle>
                <CardDescription>
                  <span>
                    {devis.objet ? `${devis.objet} — ` : ""}
                    {/* Finding : le legacy lisait `devis.dateDevis` (inexistant sur la row signature →
                        « Invalid Date »). On utilise `createdAt` (le vrai champ, déjà utilisé par le PDF). */}
                    {formatDate(devis.createdAt)}
                    {devis.dateValidite ? ` — ${t("valideJusqu", { date: formatDate(devis.dateValidite) })}` : ""}
                  </span>
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
                  <Download className="h-4 w-4 mr-2" />
                  {t("telechargerPdf")}
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Already processed banner */}
        {isAlreadyProcessed && (
          <Card className={signature.statut === "accepte" ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}>
            <CardContent className="py-4">
              <div className={`flex items-center gap-2 ${signature.statut === "accepte" ? "text-green-700" : "text-red-700"}`}>
                {signature.statut === "accepte" ? <Check className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                <span className="font-medium">
                  {signature.statut === "accepte"
                    ? t("acceptedBy", { name: signature.signataireName, date: signature.signedAt ? formatDate(signature.signedAt) : '' })
                    : `${t("refused")}${signature.motifRefus ? t("refusedMotif", { motif: signature.motifRefus }) : ''}`
                  }
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Artisan & Client Info */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">{t("artisanTitle")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="font-semibold">{artisan?.nomEntreprise}</p>
              {artisan?.adresse && <p className="text-sm text-muted-foreground">{artisan.adresse}</p>}
              {(artisan?.codePostal || artisan?.ville) && <p className="text-sm text-muted-foreground">{[artisan.codePostal, artisan.ville].filter(Boolean).join(" ")}</p>}
              {artisan?.telephone && <p className="text-sm text-muted-foreground">{t("tel")} {artisan.telephone}</p>}
              {artisan?.siret && <p className="text-sm text-muted-foreground">{t("siretLabel")} {artisan.siret}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">{t("clientTitle")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="font-semibold">{client?.prenom} {client?.nom}</p>
              {client?.adresse && <p className="text-sm text-muted-foreground">{client.adresse}</p>}
              {(client?.codePostal || client?.ville) && <p className="text-sm text-muted-foreground">{[client.codePostal, client.ville].filter(Boolean).join(" ")}</p>}
              {client?.email && <p className="text-sm text-muted-foreground">{client.email}</p>}
            </CardContent>
          </Card>
        </div>

        {/* Devis Lines */}
        <Card>
          <CardHeader>
            <CardTitle>{t("detailTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 text-sm font-medium">{t("thDesignation")}</th>
                    <th className="text-right p-3 text-sm font-medium">{t("thQte")}</th>
                    <th className="text-right p-3 text-sm font-medium">{t("thPUHT")}</th>
                    <th className="text-right p-3 text-sm font-medium">{t("thTotalHT")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((ligne: any, index: number) => (
                    <tr key={index} className="border-t">
                      <td className="p-3">
                        <p className="font-medium text-sm">{ligne.designation}</p>
                        {ligne.description && <p className="text-xs text-muted-foreground">{ligne.description}</p>}
                      </td>
                      <td className="text-right p-3 text-sm">{`${ligne.quantite} ${ligne.unite || ""}`}</td>
                      <td className="text-right p-3 text-sm">{formatCurrency(ligne.prixUnitaireHT)}</td>
                      <td className="text-right p-3 text-sm">{formatCurrency(ligne.montantHT || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t("totalHTLabel")}</span>
                  <span className="font-medium">{formatCurrency(devis.totalHT || 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t("tvaLabel")}</span>
                  <span className="font-medium">{formatCurrency(devis.totalTVA || 0)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>{t("totalTTCLabel")}</span>
                  <span className="text-primary">{formatCurrency(devis.totalTTC || 0)}</span>
                </div>
              </div>
            </div>

            {devis.conditionsPaiement && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm font-medium mb-1">{t("conditionsTitle")}</p>
                <p className="text-sm text-muted-foreground">{devis.conditionsPaiement}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Devis options / formules */}
        {options.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t("optionsTitle")}</CardTitle>
              <CardDescription>
                {t("optionsDesc")}{!isAlreadyProcessed ? t("optionsDescAvant") : "."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {options.map((option: any) => (
                <div
                  key={option.id}
                  className={`border rounded-lg p-4 ${option.selectionnee ? "border-primary bg-primary/5" : "border-muted"}`}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{option.nom}</p>
                        {option.recommandee && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            {t("recommandee")}
                          </span>
                        )}
                        {option.selectionnee && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary inline-flex items-center gap-1">
                            <Check className="h-3 w-3" /> {t("selectionnee")}
                          </span>
                        )}
                      </div>
                      {option.description && (
                        <p className="text-sm text-muted-foreground">{option.description}</p>
                      )}
                      <p className="text-sm font-medium text-primary">
                        {t("ttcSuffix", { prix: formatCurrency(option.totalTTC || 0) })}
                      </p>
                    </div>
                    {!isAlreadyProcessed && (
                      <Button
                        variant={option.selectionnee ? "secondary" : "outline"}
                        size="sm"
                        disabled={option.selectionnee || selectOptionMutation.isPending}
                        onClick={() => selectOptionMutation.mutate({ token: token || "", optionId: option.id })}
                      >
                        {option.selectionnee ? t("choisie") : t("choisir")}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Signature / Action block */}
        {!isAlreadyProcessed && !showRefuseForm && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Pen className="h-5 w-5 text-primary" />
                <CardTitle>{t("signTitle")}</CardTitle>
              </div>
              <CardDescription>
                {t("signDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">{t("nomLabel")}</Label>
                  <Input
                    id="name"
                    value={signataireName}
                    onChange={(e) => setSignataireName(e.target.value)}
                    placeholder={t("nomPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t("emailLabel")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={signataireEmail}
                    onChange={(e) => setSignataireEmail(e.target.value)}
                    placeholder={t("emailPlaceholder")}
                  />
                </div>
              </div>

              {/* Signature Canvas */}
              <div className="space-y-2">
                <Label>{t("signatureLabel")}</Label>
                <div className="border-2 border-dashed rounded-lg p-2 bg-white">
                  <canvas
                    ref={canvasRef}
                    className="w-full cursor-crosshair touch-none"
                    style={{ height: "200px" }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={clearSignature}>
                    {t("effacer")}
                  </Button>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="accept"
                  checked={accepted}
                  onCheckedChange={(val) => setAccepted(val === true)}
                  className="mt-1"
                />
                <Label htmlFor="accept" className="text-sm leading-relaxed cursor-pointer">
                  {t("acceptLabel")}
                </Label>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  size="lg"
                  onClick={handleSign}
                  disabled={isSigning || !hasSignature || !signataireName || !signataireEmail || !accepted}
                >
                  {isSigning ? (
                    <span className="flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("signing")}</span>
                  ) : (
                    <span className="flex items-center"><Check className="mr-2 h-4 w-4" /> {t("signBtn")}</span>
                  )}
                </Button>
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={() => setShowRefuseForm(true)}
                >
                  <X className="mr-2 h-4 w-4" />
                  {t("refuserBtn")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Refuse form */}
        {!isAlreadyProcessed && showRefuseForm && (
          <Card className="border-red-200">
            <CardHeader>
              <div className="flex items-center gap-2 text-red-600">
                <XCircle className="h-5 w-5" />
                <CardTitle>{t("refuseTitle")}</CardTitle>
              </div>
              <CardDescription>
                {t("refuseDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="motif">{t("motifLabel")}</Label>
                <Textarea
                  id="motif"
                  value={motifRefus}
                  onChange={(e) => setMotifRefus(e.target.value)}
                  placeholder={t("motifPlaceholder")}
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowRefuseForm(false)}
                  className="flex-1"
                >
                  {t("cancel", { ns: "common" })}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleRefuse}
                  disabled={isRefusing}
                  className="flex-1"
                >
                  {isRefusing ? (
                    <span className="flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("sending")}</span>
                  ) : (
                    <span className="flex items-center"><XCircle className="mr-2 h-4 w-4" /> {t("confirmRefuseBtn")}</span>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
