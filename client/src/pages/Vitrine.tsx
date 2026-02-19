import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Star, Phone, Mail, MapPin, Wrench, Users, Calendar,
  Award, Send, Loader2, CheckCircle, Shield, MessageSquare,
  ChevronDown, Briefcase, Clock, Zap,
} from "lucide-react";

const SPECIALITE_LABELS: Record<string, string> = {
  plomberie: "Plombier",
  electricite: "Electricien",
  chauffage: "Chauffagiste",
  "multi-services": "Multi-services",
};

function StarRating({ note, size = 16 }: { note: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={i <= note ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}
          style={{ width: size, height: size }}
        />
      ))}
    </div>
  );
}

export default function Vitrine() {
  const { slug } = useParams<{ slug: string }>();
  const [contactForm, setContactForm] = useState({ nom: "", email: "", telephone: "", message: "" });
  const [contactSent, setContactSent] = useState(false);

  const { data, isLoading, error } = trpc.vitrine.getBySlug.useQuery(
    { slug: slug || "" },
    { enabled: !!slug }
  );

  const contactMutation = trpc.vitrine.submitContact.useMutation({
    onSuccess: () => {
      setContactSent(true);
      toast.success("Message envoye avec succes !");
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <Wrench className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <h2 className="text-xl font-bold mb-2">Page non trouvee</h2>
            <p className="text-gray-500">Cette page vitrine n'existe pas ou n'est pas encore active.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { artisan, vitrine, avis, avisStats, publicStats } = data;

  return (
    <div className="min-h-screen bg-white">
      {/* HERO */}
      <section className="bg-gradient-to-br from-blue-700 via-blue-800 to-blue-900 text-white">
        <div className="max-w-5xl mx-auto px-4 py-16 md:py-24">
          <div className="text-center">
            {artisan.logo && (
              <img src={artisan.logo} alt={artisan.nomEntreprise || ""} className="h-20 w-20 rounded-full mx-auto mb-6 border-4 border-white/30 object-cover" />
            )}
            <h1 className="text-3xl md:text-5xl font-bold mb-3">{artisan.nomEntreprise}</h1>
            <p className="text-lg md:text-xl text-blue-200 mb-6">
              {SPECIALITE_LABELS[artisan.specialite || ""] || artisan.specialite}
              {artisan.ville && ` a ${artisan.ville}`}
            </p>
            <div className="flex flex-wrap justify-center gap-4 mb-8">
              {artisan.telephone && (
                <a href={`tel:${artisan.telephone}`} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-full px-5 py-2.5 transition">
                  <Phone className="h-4 w-4" /> {artisan.telephone}
                </a>
              )}
              {artisan.email && (
                <a href={`mailto:${artisan.email}`} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-full px-5 py-2.5 transition">
                  <Mail className="h-4 w-4" /> {artisan.email}
                </a>
              )}
            </div>
            {avisStats.total > 0 && (
              <div className="flex items-center justify-center gap-2 mb-8">
                <StarRating note={Math.round(avisStats.moyenne)} size={20} />
                <span className="text-lg font-semibold">{avisStats.moyenne.toFixed(1)}</span>
                <span className="text-blue-200">({avisStats.total} avis)</span>
              </div>
            )}
            <Button
              size="lg"
              className="bg-white text-blue-800 hover:bg-blue-50 font-semibold px-8"
              onClick={() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" })}
            >
              <Send className="h-4 w-4 mr-2" /> Demander un devis
            </Button>
          </div>
        </div>
        <div className="h-8 bg-gradient-to-b from-blue-900/50 to-white" />
      </section>

      {/* A PROPOS */}
      {(vitrine.description || vitrine.zone || artisan.siret) && (
        <section className="py-12 md:py-16">
          <div className="max-w-5xl mx-auto px-4">
            <h2 className="text-2xl font-bold text-center mb-8">A propos</h2>
            <div className="max-w-3xl mx-auto">
              {vitrine.description && (
                <p className="text-gray-600 text-lg leading-relaxed mb-6 whitespace-pre-line">{vitrine.description}</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {vitrine.zone && (
                  <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                    <MapPin className="h-5 w-5 text-blue-600 shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Zone d'intervention</p>
                      <p className="font-medium">{vitrine.zone}</p>
                    </div>
                  </div>
                )}
                {vitrine.experience && (
                  <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                    <Calendar className="h-5 w-5 text-blue-600 shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Experience</p>
                      <p className="font-medium">{vitrine.experience} ans</p>
                    </div>
                  </div>
                )}
                {artisan.siret && (
                  <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                    <Shield className="h-5 w-5 text-blue-600 shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">SIRET</p>
                      <p className="font-medium">{artisan.siret}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SERVICES */}
      {vitrine.services && vitrine.services.length > 0 && (
        <section className="py-12 md:py-16 bg-gray-50">
          <div className="max-w-5xl mx-auto px-4">
            <h2 className="text-2xl font-bold text-center mb-8">Nos services</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
              {vitrine.services.map((service: string, i: number) => (
                <div key={i} className="flex items-center gap-3 bg-white p-4 rounded-lg shadow-sm border">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <Zap className="h-5 w-5 text-blue-600" />
                  </div>
                  <span className="font-medium text-gray-800">{service}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CHIFFRES CLES */}
      <section className="py-12 md:py-16">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-8">En quelques chiffres</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            <Card className="text-center border-0 shadow-md">
              <CardContent className="pt-6 pb-4">
                <Users className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                <p className="text-3xl font-bold text-blue-800">{publicStats.totalClients}</p>
                <p className="text-sm text-gray-500">Clients</p>
              </CardContent>
            </Card>
            <Card className="text-center border-0 shadow-md">
              <CardContent className="pt-6 pb-4">
                <Briefcase className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                <p className="text-3xl font-bold text-blue-800">{publicStats.totalInterventions}</p>
                <p className="text-sm text-gray-500">Interventions</p>
              </CardContent>
            </Card>
            <Card className="text-center border-0 shadow-md">
              <CardContent className="pt-6 pb-4">
                <Star className="h-8 w-8 mx-auto text-yellow-500 mb-2 fill-yellow-500" />
                <p className="text-3xl font-bold text-blue-800">{avisStats.total > 0 ? avisStats.moyenne.toFixed(1) : "-"}</p>
                <p className="text-sm text-gray-500">Note moyenne</p>
              </CardContent>
            </Card>
            <Card className="text-center border-0 shadow-md">
              <CardContent className="pt-6 pb-4">
                <Clock className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                <p className="text-3xl font-bold text-blue-800">{vitrine.experience || "1+"}</p>
                <p className="text-sm text-gray-500">Ans d'experience</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* AVIS CLIENTS */}
      <section className="py-12 md:py-16 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-2">Avis clients</h2>
          {avisStats.total > 0 ? (
            <>
              <div className="text-center mb-8">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="text-4xl font-bold text-blue-800">{avisStats.moyenne.toFixed(1)}</span>
                  <span className="text-gray-400">/5</span>
                </div>
                <StarRating note={Math.round(avisStats.moyenne)} size={24} />
                <p className="text-gray-500 mt-1">{avisStats.total} avis verifie{avisStats.total > 1 ? "s" : ""}</p>
              </div>
              <div className="grid gap-4 max-w-3xl mx-auto">
                {avis.map((a: any) => (
                  <Card key={a.id} className="border-0 shadow-sm">
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-gray-800">{a.clientNom}</p>
                          <p className="text-xs text-gray-400">{new Date(a.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                        </div>
                        <StarRating note={a.note} />
                      </div>
                      {a.commentaire && <p className="text-gray-600 mt-2">{a.commentaire}</p>}
                      {a.reponseArtisan && (
                        <div className="mt-3 pl-4 border-l-2 border-blue-200 bg-blue-50/50 rounded-r p-3">
                          <p className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" /> Reponse de l'artisan
                          </p>
                          <p className="text-sm text-gray-600">{a.reponseArtisan}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <p className="text-center text-gray-400 py-8">Aucun avis pour le moment.</p>
          )}
        </div>
      </section>

      {/* FORMULAIRE DE CONTACT */}
      <section id="contact" className="py-12 md:py-16">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-8">Nous contacter</h2>
          <Card className="max-w-xl mx-auto border-0 shadow-lg">
            <CardContent className="pt-6">
              {contactSent ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                  <h3 className="text-xl font-bold mb-2">Message envoye !</h3>
                  <p className="text-gray-500">Nous vous recontacterons dans les plus brefs delais.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="nom">Nom *</Label>
                      <Input id="nom" value={contactForm.nom} onChange={(e) => setContactForm({ ...contactForm, nom: e.target.value })} placeholder="Votre nom" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input id="email" type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} placeholder="votre@email.com" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telephone">Telephone</Label>
                    <Input id="telephone" value={contactForm.telephone} onChange={(e) => setContactForm({ ...contactForm, telephone: e.target.value })} placeholder="06 12 34 56 78" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="message">Message *</Label>
                    <Textarea id="message" value={contactForm.message} onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })} placeholder="Decrivez votre besoin..." rows={5} />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => {
                      if (!contactForm.nom || !contactForm.email || contactForm.message.length < 10) {
                        toast.error("Veuillez remplir tous les champs obligatoires (message min. 10 caracteres)");
                        return;
                      }
                      contactMutation.mutate({ slug: slug || "", ...contactForm });
                    }}
                    disabled={contactMutation.isPending}
                  >
                    {contactMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Envoi...</> : <><Send className="h-4 w-4 mr-2" /> Envoyer</>}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-gray-900 text-gray-400 py-8">
        <div className="max-w-5xl mx-auto px-4 text-center text-sm">
          <p className="font-semibold text-white mb-2">{artisan.nomEntreprise}</p>
          {(artisan.adresse || artisan.ville) && (
            <p>{artisan.adresse}{artisan.codePostal && `, ${artisan.codePostal}`}{artisan.ville && ` ${artisan.ville}`}</p>
          )}
          {artisan.telephone && <p>{artisan.telephone}</p>}
          {artisan.email && <p>{artisan.email}</p>}
          {artisan.siret && <p className="mt-2">SIRET : {artisan.siret}</p>}
          <p className="mt-4 text-gray-500 text-xs">Propulse par Artisan Pro</p>
        </div>
      </footer>
    </div>
  );
}
