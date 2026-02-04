import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { Loader2, Check, FileText, Building2, User, Pen, AlertCircle, Phone, Shield, MessageSquare } from "lucide-react";
import { toast } from "sonner";

type SignatureStep = "info" | "sms" | "signature";

export default function SignatureDevis() {
  const { token } = useParams<{ token: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signataireName, setSignataireName] = useState("");
  const [signataireEmail, setSignataireEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [isSigning, setIsSigning] = useState(false);
  const [signatureComplete, setSignatureComplete] = useState(false);
  const [currentStep, setCurrentStep] = useState<SignatureStep>("info");
  const [smsVerified, setSmsVerified] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  const { data, isLoading, error } = trpc.signature.getDevisForSignature.useQuery(
    { token: token || "" },
    { enabled: !!token }
  );

  const requestSmsMutation = trpc.signature.requestSmsCode.useMutation({
    onSuccess: (data) => {
      toast.success("Code de vérification envoyé par SMS");
      setCurrentStep("sms");
      if (data.devCode) {
        setDevCode(data.devCode);
      }
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const verifySmsMutation = trpc.signature.verifySmsCode.useMutation({
    onSuccess: () => {
      toast.success("Code vérifié avec succès");
      setSmsVerified(true);
      setCurrentStep("signature");
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

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
  }, [data, currentStep]);

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

  const handleRequestSms = () => {
    if (!signataireName || !signataireEmail || !telephone) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }
    
    // Validation basique du numéro de téléphone
    const phoneRegex = /^(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}$/;
    if (!phoneRegex.test(telephone.replace(/\s/g, ''))) {
      toast.error("Veuillez entrer un numéro de téléphone valide");
      return;
    }

    requestSmsMutation.mutate({
      token: token || "",
      telephone: telephone.replace(/\s/g, '')
    });
  };

  const handleVerifySms = () => {
    if (!smsCode || smsCode.length !== 6) {
      toast.error("Veuillez entrer un code à 6 chiffres");
      return;
    }

    verifySmsMutation.mutate({
      token: token || "",
      code: smsCode
    });
  };

  const handleSign = async () => {
    if (!hasSignature || !signataireName || !signataireEmail || !token) {
      toast.error("Veuillez remplir tous les champs et signer le document");
      return;
    }

    if (!smsVerified) {
      toast.error("Veuillez d'abord vérifier votre numéro de téléphone");
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
      signataireEmail,
      smsVerified: true
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

        {/* Progress Steps */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-2 ${currentStep === "info" ? "text-primary" : smsVerified ? "text-green-500" : "text-muted-foreground"}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === "info" ? "bg-primary text-white" : smsVerified ? "bg-green-500 text-white" : "bg-muted"}`}>
                  {smsVerified ? <Check className="h-4 w-4" /> : "1"}
                </div>
                <span className="hidden sm:inline font-medium">Informations</span>
              </div>
              <div className="flex-1 h-1 mx-4 bg-muted">
                <div className={`h-full transition-all ${currentStep !== "info" ? "bg-primary" : "bg-muted"}`} style={{ width: currentStep === "info" ? "0%" : "100%" }} />
              </div>
              <div className={`flex items-center gap-2 ${currentStep === "sms" ? "text-primary" : smsVerified ? "text-green-500" : "text-muted-foreground"}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === "sms" ? "bg-primary text-white" : smsVerified ? "bg-green-500 text-white" : "bg-muted"}`}>
                  {smsVerified ? <Check className="h-4 w-4" /> : "2"}
                </div>
                <span className="hidden sm:inline font-medium">Vérification SMS</span>
              </div>
              <div className="flex-1 h-1 mx-4 bg-muted">
                <div className={`h-full transition-all ${currentStep === "signature" ? "bg-primary" : "bg-muted"}`} style={{ width: currentStep === "signature" ? "100%" : "0%" }} />
              </div>
              <div className={`flex items-center gap-2 ${currentStep === "signature" ? "text-primary" : "text-muted-foreground"}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === "signature" ? "bg-primary text-white" : "bg-muted"}`}>
                  3
                </div>
                <span className="hidden sm:inline font-medium">Signature</span>
              </div>
            </div>
          </CardContent>
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

        {/* Step 1: Information */}
        {currentStep === "info" && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <CardTitle>Vos informations</CardTitle>
              </div>
              <CardDescription>
                Renseignez vos informations pour procéder à la signature.
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
                <Label htmlFor="telephone">Numéro de téléphone *</Label>
                <div className="flex gap-2">
                  <Phone className="h-5 w-5 mt-2 text-muted-foreground" />
                  <Input
                    id="telephone"
                    type="tel"
                    value={telephone}
                    onChange={(e) => setTelephone(e.target.value)}
                    placeholder="06 12 34 56 78"
                    className="flex-1"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Un code de vérification sera envoyé à ce numéro pour sécuriser la signature.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-900">Signature sécurisée</p>
                    <p className="text-sm text-blue-700">
                      Pour garantir l'authenticité de votre signature, nous utilisons une vérification par SMS.
                      Vous recevrez un code à 6 chiffres sur votre téléphone.
                    </p>
                  </div>
                </div>
              </div>

              <Button
                className="w-full"
                onClick={handleRequestSms}
                disabled={requestSmsMutation.isPending || !signataireName || !signataireEmail || !telephone}
              >
                {requestSmsMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Envoi du code...
                  </>
                ) : (
                  <>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Recevoir le code de vérification
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: SMS Verification */}
        {currentStep === "sms" && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                <CardTitle>Vérification SMS</CardTitle>
              </div>
              <CardDescription>
                Entrez le code à 6 chiffres envoyé au {telephone}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {devCode && (
                <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    <strong>Mode développement:</strong> Le code de vérification est <strong className="text-lg">{devCode}</strong>
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="smsCode">Code de vérification</Label>
                <Input
                  id="smsCode"
                  type="text"
                  maxLength={6}
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="text-center text-2xl tracking-widest"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCurrentStep("info")}
                  className="flex-1"
                >
                  Retour
                </Button>
                <Button
                  onClick={handleVerifySms}
                  disabled={verifySmsMutation.isPending || smsCode.length !== 6}
                  className="flex-1"
                >
                  {verifySmsMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Vérification...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Vérifier le code
                    </>
                  )}
                </Button>
              </div>

              <div className="text-center">
                <Button
                  variant="link"
                  onClick={handleRequestSms}
                  disabled={requestSmsMutation.isPending}
                >
                  Renvoyer le code
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Signature */}
        {currentStep === "signature" && (
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
              <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-green-700">
                  <Check className="h-5 w-5" />
                  <span className="font-medium">Numéro de téléphone vérifié: {telephone}</span>
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
                disabled={isSigning || !hasSignature}
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
        )}
      </div>
    </div>
  );
}
