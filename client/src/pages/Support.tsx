import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Mail, BookOpen, Sparkles, Send, MessageCircle, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

const FAQ = [
  {
    q: "Comment créer mon premier devis ?",
    r: "Allez dans Commercial → Devis, puis cliquez sur \"Nouveau devis\". Sélectionnez un client, ajoutez vos lignes (services ou articles depuis votre bibliothèque), MonAssistant peut même rédiger le devis pour vous depuis une description.",
  },
  {
    q: "Comment envoyer une facture par email ?",
    r: "Ouvrez la facture, cliquez sur \"Envoyer par email\". Le PDF est généré automatiquement, l'email pré-rempli avec un modèle (modifiable dans Paramètres → Modèles d'emails). Vous pouvez aussi inclure un lien de paiement Stripe.",
  },
  {
    q: "Comment configurer le paiement en ligne ?",
    r: "Le paiement en ligne par carte est disponible sur tous les plans. Stripe se charge du traitement, vous n'avez rien à configurer côté Operioz. Lors de l'envoi d'une facture, cochez \"Inclure un lien de paiement\".",
  },
  {
    q: "Comment importer mes anciens clients ?",
    r: "Dans Paramètres → Importer des données, vous pouvez téléverser un fichier Excel ou CSV. Vous mappez les colonnes (nom, email, téléphone…) et nous créons les clients en lot. Compatibilité avec EBP, Sage, Ciel et autres logiciels.",
  },
  {
    q: "Comment changer mon mot de passe ?",
    r: "Mon profil → Sécurité → Mot de passe. Vous devrez saisir l'ancien mot de passe pour confirmer. En cas d'oubli, utilisez \"Mot de passe oublié\" sur la page de connexion.",
  },
];

export default function Support() {
  const [formData, setFormData] = useState({
    nom: "",
    email: "",
    sujet: "technique",
    message: "",
  });

  const contactMut = trpc.support.contact.useMutation({
    onSuccess: () => {
      toast.success("Votre message a été envoyé. Nous répondons sous 24h.");
      setFormData({ nom: "", email: "", sujet: "technique", message: "" });
    },
    onError: (e) => toast.error(e.message || "Erreur lors de l'envoi"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nom || !formData.email || !formData.message) {
      toast.error("Merci de remplir tous les champs");
      return;
    }
    contactMut.mutate(formData);
  };

  const openAssistant = () => {
    window.dispatchEvent(new CustomEvent("operioz:open-assistant"));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white p-8">
        <h1 className="text-3xl font-bold">Centre d'aide Operioz</h1>
        <p className="text-blue-100 mt-2 text-base">
          Notre équipe est là pour vous aider, 5j/7
        </p>
      </div>

      {/* SECTION 2 : Canaux de contact */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="flex flex-col">
          <CardHeader>
            <div className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/40 text-blue-600 mb-2">
              <Mail className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">Envoyer un email</CardTitle>
            <CardDescription>support@operioz.com — Réponse sous 24h</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex items-end">
            <Button asChild variant="outline" className="w-full">
              <a href="mailto:support@operioz.com">Envoyer un email →</a>
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <div className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 mb-2">
              <BookOpen className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">Guide d'utilisation</CardTitle>
            <CardDescription>Toutes les fonctionnalités expliquées étape par étape</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex items-end">
            <Button asChild variant="outline" className="w-full">
              <Link to="/documentation">Consulter le guide →</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <div className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-950/40 text-violet-600 mb-2">
              <Sparkles className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">Demander à MonAssistant</CardTitle>
            <CardDescription>Votre IA disponible 24h/24, 7j/7</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex items-end">
            <Button onClick={openAssistant} variant="outline" className="w-full">
              Ouvrir MonAssistant →
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* SECTION 3 : FAQ */}
      <Card>
        <CardHeader>
          <CardTitle>Questions fréquentes</CardTitle>
          <CardDescription>Les réponses aux questions les plus posées par nos utilisateurs</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {FAQ.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{item.r}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* SECTION 4 : Formulaire de contact */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Nous contacter
          </CardTitle>
          <CardDescription>
            Décrivez votre besoin, nous vous répondons par email sous 24h ouvrées.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nom">Nom</Label>
                <Input
                  id="nom"
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sujet">Sujet</Label>
              <Select value={formData.sujet} onValueChange={(v) => setFormData({ ...formData, sujet: v })}>
                <SelectTrigger id="sujet">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="technique">Problème technique</SelectItem>
                  <SelectItem value="facturation">Question facturation</SelectItem>
                  <SelectItem value="suggestion">Suggestion</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                rows={6}
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                required
                placeholder="Décrivez votre demande..."
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={contactMut.isPending}>
                {contactMut.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Envoi...</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" /> Envoyer</>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
