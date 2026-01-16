import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface ClientPreview {
  nom: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
  notes?: string;
  status?: "valid" | "error";
  error?: string;
}

export default function ImportClients() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ClientPreview[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = trpc.clients.importFromExcel.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.imported} clients importés avec succès`);
      if (result.skipped > 0) {
        toast.info(`${result.skipped} clients ignorés (doublons)`);
      }
      setFile(null);
      setPreview([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    onError: (error) => {
      toast.error("Erreur lors de l'import : " + error.message);
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Vérifier le type de fichier
    if (
      !selectedFile.name.endsWith(".xlsx") &&
      !selectedFile.name.endsWith(".xls") &&
      !selectedFile.name.endsWith(".csv")
    ) {
      toast.error("Veuillez sélectionner un fichier Excel (.xlsx, .xls) ou CSV");
      return;
    }

    setFile(selectedFile);
    setIsLoading(true);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

      // Valider et transformer les données
      const clients: ClientPreview[] = data
        .map((row, index) => {
          const client: ClientPreview = {
            nom: String(row.nom || row.Nom || "").trim(),
            prenom: String(row.prenom || row.Prénom || "").trim() || undefined,
            email: String(row.email || row.Email || "").trim() || undefined,
            telephone: String(row.telephone || row.Téléphone || "").trim() || undefined,
            adresse: String(row.adresse || row.Adresse || "").trim() || undefined,
            codePostal: String(row.codePostal || row["Code Postal"] || "").trim() || undefined,
            ville: String(row.ville || row.Ville || "").trim() || undefined,
            notes: String(row.notes || row.Notes || "").trim() || undefined,
            status: "valid",
          };

          // Valider les champs obligatoires
          if (!client.nom) {
            client.status = "error";
            client.error = "Le nom est obligatoire";
          } else if (client.email && !isValidEmail(client.email)) {
            client.status = "error";
            client.error = "Email invalide";
          } else if (client.telephone && !isValidPhone(client.telephone)) {
            client.status = "error";
            client.error = "Téléphone invalide";
          }

          return client;
        })
        .filter((client) => client.nom); // Filtrer les lignes vides

      setPreview(clients);

      if (clients.length === 0) {
        toast.error("Aucun client valide trouvé dans le fichier");
        setFile(null);
      } else {
        const validCount = clients.filter((c) => c.status === "valid").length;
        const errorCount = clients.filter((c) => c.status === "error").length;
        toast.success(`${validCount} clients valides, ${errorCount} avec erreurs`);
      }
    } catch (error) {
      console.error("Erreur lors de la lecture du fichier:", error);
      toast.error("Erreur lors de la lecture du fichier Excel");
      setFile(null);
      setPreview([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (preview.length === 0) {
      toast.error("Aucun client à importer");
      return;
    }

    const validClients = preview.filter((c) => c.status === "valid");
    if (validClients.length === 0) {
      toast.error("Aucun client valide à importer");
      return;
    }

    importMutation.mutate({
      clients: validClients.map(({ status, error, ...client }) => client),
    });
  };

  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const isValidPhone = (phone: string) => {
    // Accepter les numéros avec au moins 9 chiffres
    const phoneRegex = /[\d\s\-\+\(\)]{9,}/;
    return phoneRegex.test(phone);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Import de Clients</h1>
        <p className="text-muted-foreground">Importez vos clients depuis un fichier Excel ou CSV</p>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>Sélectionner un fichier</CardTitle>
          <CardDescription>
            Accepte les formats .xlsx, .xls et .csv. Les colonnes doivent être nommées : nom, prenom, email, telephone, adresse, codePostal, ville, notes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-muted hover:bg-muted/80">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-10 h-10 text-muted-foreground mb-2" />
                  <p className="mb-2 text-sm font-semibold">
                    Cliquez pour sélectionner un fichier
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ou glissez-déposez votre fichier ici
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  disabled={isLoading}
                />
              </label>
            </div>

            {file && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="font-semibold text-sm">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview Section */}
      {preview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Aperçu des clients</CardTitle>
            <CardDescription>
              {preview.filter((c) => c.status === "valid").length} clients valides,{" "}
              {preview.filter((c) => c.status === "error").length} avec erreurs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Erreurs */}
              {preview.some((c) => c.status === "error") && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Certains clients ont des erreurs et ne seront pas importés
                  </AlertDescription>
                </Alert>
              )}

              {/* Tableau */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>Prénom</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead>Adresse</TableHead>
                      <TableHead>Ville</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((client, index) => (
                      <TableRow
                        key={index}
                        className={
                          client.status === "error" ? "bg-red-50" : "bg-green-50"
                        }
                      >
                        <TableCell>
                          {client.status === "valid" ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-red-600" />
                          )}
                        </TableCell>
                        <TableCell className="font-semibold">{client.nom}</TableCell>
                        <TableCell>{client.prenom || "-"}</TableCell>
                        <TableCell className="text-sm">{client.email || "-"}</TableCell>
                        <TableCell className="text-sm">{client.telephone || "-"}</TableCell>
                        <TableCell className="text-sm">{client.adresse || "-"}</TableCell>
                        <TableCell className="text-sm">{client.ville || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Erreurs détaillées */}
              {preview.some((c) => c.error) && (
                <div className="space-y-2">
                  <p className="font-semibold text-sm">Erreurs détectées :</p>
                  {preview
                    .filter((c) => c.error)
                    .map((client, index) => (
                      <div
                        key={index}
                        className="text-sm text-red-600 bg-red-50 p-2 rounded"
                      >
                        <strong>{client.nom}</strong> : {client.error}
                      </div>
                    ))}
                </div>
              )}

              {/* Boutons d'action */}
              <div className="flex gap-2">
                <Button
                  onClick={handleImport}
                  disabled={
                    importMutation.isPending ||
                    preview.filter((c) => c.status === "valid").length === 0
                  }
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Import en cours...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Importer {preview.filter((c) => c.status === "valid").length}{" "}
                      client(s)
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setFile(null);
                    setPreview([]);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                >
                  Annuler
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Template Download */}
      <Card>
        <CardHeader>
          <CardTitle>Modèle de fichier</CardTitle>
          <CardDescription>
            Téléchargez un modèle Excel pour voir le format attendu
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => {
              // Créer un fichier Excel de template
              const template = [
                {
                  nom: "Dupont",
                  prenom: "Jean",
                  email: "jean.dupont@email.fr",
                  telephone: "06 12 34 56 78",
                  adresse: "25 Avenue des Champs-Élysées",
                  codePostal: "75008",
                  ville: "Paris",
                  notes: "Client VIP",
                },
              ];

              const ws = XLSX.utils.json_to_sheet(template);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, "Clients");
              XLSX.writeFile(wb, "modele_clients.xlsx");
              toast.success("Modèle téléchargé");
            }}
          >
            <Download className="w-4 h-4 mr-2" />
            Télécharger le modèle
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Download({ className }: { className: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
