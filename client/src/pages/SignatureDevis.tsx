import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { Loader2, Check, FileText, Building2, User, Pen, AlertCircle, Download, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { generateDevisPDF } from "@/lib/pdfGenerator";

export default function SignatureDevis() {
  const { token } = useParams<{ token: string }>();
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

  // Pre-fill email from client data when it loads
  useEffect(() => {
    if (data?.client?.email && !signataireEmail) {
      setSignataireEmail(data.client.email);
    }
  }, [data]);

  const signMutation = trpc.signature.signDevis.useMutation({
    onSuccess: () => {
      setActionComplete("accepte");
      toast.success("Devis accepte et signe !");
    },
    onError: (error) => {
      toast.error(error.message);
      setIsSigning(false);
    }
  });

  const refuseMutation = trpc.signature.refuseDevis.useMutation({
    onSuccess: () => {
      setActionComplete("refuse");
      toast.success("Devis refuse");
    },
    onError: (error) => {
      toast.error(error.message);
      setIsRefusing(false);
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

  // Canvas resize on window resize
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
      toast.error("Veuillez remplir tous les champs, cocher l'acceptation et signer");
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
    generateDevisPDF(a || {}, c || {}, {
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
              <CardTitle>Lien invalide</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Confirmation page after accept/refuse
  if (actionComplete) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className={`flex items-center gap-2 ${actionComplete === "accepte" ? "text-green-500" : "text-red-500"}`}>
              {actionComplete === "accepte" ? <Check className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
              <CardTitle>{actionComplete === "accepte" ? "Devis accepte et signe" : "Devis refuse"}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              {actionComplete === "accepte"
                ? <>Le devis <strong>{data?.devis.numero}</strong> a ete accepte et signe avec succes. L'artisan a ete notifie.</>
                : <>Le devis <strong>{data?.devis.numero}</strong> a ete refuse. L'artisan a ete notifie.</>
              }
            </p>
            <p className="text-sm text-muted-foreground">Vous pouvez fermer cette page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const { devis, artisan, client, lignes, signature } = data;
  const isAlreadyProcessed = signature.statut === "accepte" || signature.statut === "refuse";

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="text-2xl">Devis n&deg; {devis.numero}</CardTitle>
                <CardDescription>
                  {devis.objet && <>{devis.objet} &mdash; </>}
                  {formatDate(devis.dateDevis)}
                  {devis.dateValidite && <> &mdash; Valide jusqu'au {formatDate(devis.dateValidite)}</>}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
                  <Download className="h-4 w-4 mr-2" />
                  Telecharger PDF
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
                    ? `Ce devis a ete accepte et signe par ${signature.signataireName} le ${signature.signedAt ? formatDate(signature.signedAt) : ''}`
                    : `Ce devis a ete refuse${signature.motifRefus ? ` — Motif : ${signature.motifRefus}` : ''}`
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
                <CardTitle className="text-lg">Artisan</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="font-semibold">{artisan?.nomEntreprise}</p>
              {artisan?.adresse && <p className="text-sm text-muted-foreground">{artisan.adresse}</p>}
              {(artisan?.codePostal || artisan?.ville) && <p className="text-sm text-muted-foreground">{artisan.codePostal} {artisan.ville}</p>}
              {artisan?.telephone && <p className="text-sm text-muted-foreground">Tel: {artisan.telephone}</p>}
              {artisan?.siret && <p className="text-sm text-muted-foreground">SIRET: {artisan.siret}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Client</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="font-semibold">{client?.prenom} {client?.nom}</p>
              {client?.adresse && <p className="text-sm text-muted-foreground">{client.adresse}</p>}
              {(client?.codePostal || client?.ville) && <p className="text-sm text-muted-foreground">{client.codePostal} {client.ville}</p>}
              {client?.email && <p className="text-sm text-muted-foreground">{client.email}</p>}
            </CardContent>
          </Card>
        </div>

        {/* Devis Lines */}
        <Card>
          <CardHeader>
            <CardTitle>Detail du devis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 text-sm font-medium">Designation</th>
                    <th className="text-right p-3 text-sm font-medium">Qte</th>
                    <th className="text-right p-3 text-sm font-medium">P.U. HT</th>
                    <th className="text-right p-3 text-sm font-medium">Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((ligne: any, index: number) => (
                    <tr key={index} className="border-t">
                      <td className="p-3">
                        <p className="font-medium text-sm">{ligne.designation}</p>
                        {ligne.description && <p className="text-xs text-muted-foreground">{ligne.description}</p>}
                      </td>
                      <td className="text-right p-3 text-sm">{ligne.quantite} {ligne.unite}</td>
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
                  <span>Total HT:</span>
                  <span className="font-medium">{formatCurrency(devis.totalHT || 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>TVA:</span>
                  <span className="font-medium">{formatCurrency(devis.totalTVA || 0)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total TTC:</span>
                  <span className="text-primary">{formatCurrency(devis.totalTTC || 0)}</span>
                </div>
              </div>
            </div>

            {devis.conditionsPaiement && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm font-medium mb-1">Conditions de paiement</p>
                <p className="text-sm text-muted-foreground">{devis.conditionsPaiement}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Signature / Action block — only if not already processed */}
        {!isAlreadyProcessed && !showRefuseForm && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Pen className="h-5 w-5 text-primary" />
                <CardTitle>Accepter et signer ce devis</CardTitle>
              </div>
              <CardDescription>
                Remplissez les informations ci-dessous puis signez pour accepter ce devis.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Name + Email */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom complet du signataire *</Label>
                  <Input
                    id="name"
                    value={signataireName}
                    onChange={(e) => setSignataireName(e.target.value)}
                    placeholder="Prenom Nom"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={signataireEmail}
                    onChange={(e) => setSignataireEmail(e.target.value)}
                    placeholder="votre@email.com"
                  />
                </div>
              </div>

              {/* Signature Canvas */}
              <div className="space-y-2">
                <Label>Signature manuscrite *</Label>
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
                    Effacer
                  </Button>
                </div>
              </div>

              {/* Checkbox */}
              <div className="flex items-start gap-3">
                <Checkbox
                  id="accept"
                  checked={accepted}
                  onCheckedChange={(val) => setAccepted(val === true)}
                  className="mt-1"
                />
                <Label htmlFor="accept" className="text-sm leading-relaxed cursor-pointer">
                  J'accepte ce devis et les conditions generales. Je certifie que les informations fournies sont exactes.
                  Cette signature electronique a valeur legale conformement au reglement eIDAS.
                </Label>
              </div>

              {/* Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  size="lg"
                  onClick={handleSign}
                  disabled={isSigning || !hasSignature || !signataireName || !signataireEmail || !accepted}
                >
                  {isSigning ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signature en cours...</>
                  ) : (
                    <><Check className="mr-2 h-4 w-4" /> Accepter et signer</>
                  )}
                </Button>
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={() => setShowRefuseForm(true)}
                >
                  <X className="mr-2 h-4 w-4" />
                  Refuser le devis
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
                <CardTitle>Refuser ce devis</CardTitle>
              </div>
              <CardDescription>
                Vous pouvez indiquer un motif de refus (optionnel).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="motif">Motif du refus (optionnel)</Label>
                <Textarea
                  id="motif"
                  value={motifRefus}
                  onChange={(e) => setMotifRefus(e.target.value)}
                  placeholder="Expliquez pourquoi vous refusez ce devis..."
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowRefuseForm(false)}
                  className="flex-1"
                >
                  Annuler
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleRefuse}
                  disabled={isRefusing}
                  className="flex-1"
                >
                  {isRefusing ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Envoi...</>
                  ) : (
                    <><XCircle className="mr-2 h-4 w-4" /> Confirmer le refus</>
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
