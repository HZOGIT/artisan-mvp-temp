import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { Loader2, Check, FileText, Building2, User, Pen, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function SignatureDevis() {
  const { token } = useParams<{ token: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signataireName, setSignataireName] = useState("");
  const [signataireEmail, setSignataireEmail] = useState("");
  const [isSigning, setIsSigning] = useState(false);
  const [signatureComplete, setSignatureComplete] = useState(false);

  const { data, isLoading, error } = trpc.signature.getDevisForSignature.useQuery(
    { token: token || "" },
    { enabled: !!token }
  );

  const signMutation = trpc.signature.signDevis.useMutation({
    onSuccess: () => {
      setSignatureComplete(true);
      toast.success("Devis signé avec succès !");
    },
    onError: (error) => {
      toast.error(error.message);
      setIsSigning(false);
    }
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = 200;

    // Set drawing style
    ctx.strokeStyle = "#1e40af";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [data]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsDrawing(true);
    setHasSignature(true);

    const rect = canvas.getBoundingClientRect();
    let x, y;

    if ("touches" in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let x, y;

    if ("touches" in e) {
      e.preventDefault();
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSign = async () => {
    if (!hasSignature || !signataireName || !signataireEmail || !token) {
      toast.error("Veuillez remplir tous les champs et signer le document");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsSigning(true);
    const signatureData = canvas.toDataURL("image/png");

    signMutation.mutate({
      token,
      signatureData,
      signataireName,
      signataireEmail
    });
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(num);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
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
              <CardTitle>Erreur</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (signatureComplete) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-green-500">
              <Check className="h-6 w-6" />
              <CardTitle>Signature confirmée</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Le devis <strong>{data?.devis.numero}</strong> a été signé avec succès.
            </p>
            <p className="text-sm text-muted-foreground">
              Une confirmation a été envoyée à l'artisan. Vous pouvez fermer cette page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const { devis, artisan, client, lignes } = data;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">Signature du Devis</CardTitle>
                <CardDescription>Devis n° {devis.numero}</CardDescription>
              </div>
              <FileText className="h-12 w-12 text-primary" />
            </div>
          </CardHeader>
        </Card>

        {/* Artisan & Client Info */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Émetteur</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="font-semibold">{artisan?.nomEntreprise}</p>
              <p className="text-sm text-muted-foreground">{artisan?.adresse}</p>
              <p className="text-sm text-muted-foreground">{artisan?.codePostal} {artisan?.ville}</p>
              <p className="text-sm text-muted-foreground">SIRET: {artisan?.siret}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Client</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="font-semibold">{client?.nom}</p>
              <p className="text-sm text-muted-foreground">{client?.adresse}</p>
              <p className="text-sm text-muted-foreground">{client?.codePostal} {client?.ville}</p>
              <p className="text-sm text-muted-foreground">{client?.email}</p>
            </CardContent>
          </Card>
        </div>

        {/* Devis Details */}
        <Card>
          <CardHeader>
            <CardTitle>Détail du devis</CardTitle>
            <CardDescription>
              Date: {formatDate(devis.dateDevis)} | Validité: {devis.dateValidite ? formatDate(devis.dateValidite) : 'Non spécifiée'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {devis.objet && (
              <div className="mb-4">
                <p className="font-medium">Objet:</p>
                <p className="text-muted-foreground">{devis.objet}</p>
              </div>
            )}

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3">Désignation</th>
                    <th className="text-right p-3">Qté</th>
                    <th className="text-right p-3">P.U. HT</th>
                    <th className="text-right p-3">Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((ligne, index) => (
                    <tr key={index} className="border-t">
                      <td className="p-3">
                        <p className="font-medium">{ligne.designation}</p>
                        {ligne.description && (
                          <p className="text-sm text-muted-foreground">{ligne.description}</p>
                        )}
                      </td>
                      <td className="text-right p-3">{ligne.quantite} {ligne.unite}</td>
                      <td className="text-right p-3">{formatCurrency(ligne.prixUnitaireHT)}</td>
                      <td className="text-right p-3">{formatCurrency(ligne.montantHT || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between">
                  <span>Total HT:</span>
                  <span className="font-medium">{formatCurrency(devis.totalHT || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>TVA:</span>
                  <span className="font-medium">{formatCurrency(devis.totalTVA || 0)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total TTC:</span>
                  <span>{formatCurrency(devis.totalTTC || 0)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Signature Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Pen className="h-5 w-5 text-primary" />
              <CardTitle>Votre signature</CardTitle>
            </div>
            <CardDescription>
              En signant ce devis, vous acceptez les conditions et le montant proposé.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nom complet *</Label>
                <Input
                  id="name"
                  value={signataireName}
                  onChange={(e) => setSignataireName(e.target.value)}
                  placeholder="Votre nom complet"
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
                  Effacer la signature
                </Button>
              </div>
            </div>

            <div className="bg-muted p-4 rounded-lg text-sm text-muted-foreground">
              <p>
                En cliquant sur "Signer et accepter le devis", je certifie avoir lu et accepté les termes de ce devis.
                Cette signature électronique a valeur légale conformément au règlement eIDAS.
              </p>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleSign}
              disabled={isSigning || !hasSignature || !signataireName || !signataireEmail}
            >
              {isSigning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signature en cours...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Signer et accepter le devis
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
