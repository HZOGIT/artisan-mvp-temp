import jsPDF from "jspdf";

async function loadFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Police ${url} introuvable (${res.status})`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

function eurFmt(n: number | string | null | undefined) {
  const v = typeof n === "string" ? parseFloat(n) : Number(n || 0);
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export type RapportDepensesData = {
  /** YYYY-MM */
  mois: string;
  artisanNom: string;
  stats: {
    totalMois: number;
    totalAnnee: number;
    tvaRecuperable: number;
    aRembourser: number;
    nbDepensesMois: number;
    variation: number | null;
    parCategorie?: Array<{ categorie: string; total: number; nb: number }>;
    topDepenses?: Array<{ numero: string; fournisseur: string; categorie: string; montant_ttc: number; date_depense: string }>;
  };
  budgets: Array<{ categorie: string; budget: number; reel: number; ecart: number; pct: number }>;
};

export async function generateRapportDepensesPDF(data: RapportDepensesData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  let robotoLoaded = false;
  try {
    const [regB64, boldB64] = await Promise.all([
      loadFontBase64("/api/fonts/roboto-regular.ttf"),
      loadFontBase64("/api/fonts/roboto-bold.ttf"),
    ]);
    doc.addFileToVFS("Roboto-Regular.ttf", regB64);
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    doc.addFileToVFS("Roboto-Bold.ttf", boldB64);
    doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
    doc.setFont("Roboto", "normal");
    robotoLoaded = true;
  } catch {
    doc.setFont("helvetica", "normal");
  }

  const W = 210;
  const margin = 18;
  let y = margin;

  const violet: [number, number, number] = [139, 92, 246];
  const slate: [number, number, number] = [71, 85, 105];
  const lightSlate: [number, number, number] = [148, 163, 184];
  const ok: [number, number, number] = [16, 185, 129];
  const warn: [number, number, number] = [249, 115, 22];
  const danger: [number, number, number] = [239, 68, 68];

  const font = robotoLoaded ? "Roboto" : "helvetica";
  const setFont = (style: "normal" | "bold") => doc.setFont(font, style);

  /** ============ HEADER ============ */
  doc.setFillColor(...violet);
  doc.rect(0, 0, W, 30, "F");
  doc.setTextColor(255, 255, 255);
  setFont("bold");
  doc.setFontSize(18);
  doc.text("Rapport de dépenses", margin, 14);
  setFont("normal");
  doc.setFontSize(11);
  const [y2, m2] = data.mois.split("-").map(Number);
  const moisLib = new Date(y2, m2 - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  doc.text(moisLib, margin, 22);
  doc.setFontSize(9);
  doc.text(data.artisanNom, W - margin, 22, { align: "right" });

  y = 40;

  /** ============ RÉSUMÉ ============ */
  doc.setTextColor(...slate);
  setFont("bold");
  doc.setFontSize(13);
  doc.text("Résumé", margin, y);
  y += 6;

  doc.setDrawColor(...lightSlate);
  doc.setLineWidth(0.2);
  doc.line(margin, y, W - margin, y);
  y += 5;

  setFont("normal");
  doc.setFontSize(10);
  const resume = [
    ["Total dépenses du mois", eurFmt(data.stats.totalMois)],
    ["Nombre de dépenses", String(data.stats.nbDepensesMois)],
    ["TVA récupérable", eurFmt(data.stats.tvaRecuperable)],
    ["À rembourser", eurFmt(data.stats.aRembourser)],
    ["Total depuis le début de l'année", eurFmt(data.stats.totalAnnee)],
  ];
  if (data.stats.variation !== null && data.stats.variation !== undefined) {
    const sens = data.stats.variation > 0 ? "↑" : "↓";
    resume.push([
      "Évolution vs mois précédent",
      `${sens} ${Math.abs(data.stats.variation).toFixed(0)}%`,
    ]);
  }
  for (const [label, val] of resume) {
    doc.setTextColor(...slate);
    doc.text(label, margin, y);
    doc.setTextColor(30, 41, 59);
    doc.text(val, W - margin, y, { align: "right" });
    y += 6;
  }

  y += 6;

  /** ============ PAR CATÉGORIE ============ */
  setFont("bold");
  doc.setFontSize(13);
  doc.setTextColor(...slate);
  doc.text("Par catégorie", margin, y);
  y += 6;
  doc.line(margin, y, W - margin, y);
  y += 5;

  /** Header tableau */
  setFont("bold");
  doc.setFontSize(9);
  doc.setTextColor(...lightSlate);
  doc.text("Catégorie", margin, y);
  doc.text("Budget", margin + 80, y, { align: "right" });
  doc.text("Réalisé", margin + 110, y, { align: "right" });
  doc.text("Écart", margin + 140, y, { align: "right" });
  doc.text("%", W - margin, y, { align: "right" });
  y += 4;
  doc.setDrawColor(...lightSlate);
  doc.line(margin, y, W - margin, y);
  y += 4;

  setFont("normal");
  doc.setFontSize(9);
  for (const b of data.budgets) {
    if (b.budget === 0 && b.reel === 0) continue;
    if (y > 250) {
      doc.addPage();
      y = margin;
    }
    doc.setTextColor(30, 41, 59);
    doc.text(String(b.categorie).slice(0, 38), margin, y);
    doc.text(eurFmt(b.budget), margin + 80, y, { align: "right" });
    doc.text(eurFmt(b.reel), margin + 110, y, { align: "right" });
    const couleurEcart = b.ecart < 0 ? danger : ok;
    doc.setTextColor(...couleurEcart);
    doc.text((b.ecart < 0 ? "−" : "+") + eurFmt(Math.abs(b.ecart)), margin + 140, y, { align: "right" });
    const couleurPct = b.pct > 100 ? danger : b.pct > 75 ? warn : ok;
    doc.setTextColor(...couleurPct);
    doc.text(`${b.pct}%`, W - margin, y, { align: "right" });
    y += 5;
  }
  y += 4;

  /** ============ TOP 10 DÉPENSES ============ */
  if (data.stats.topDepenses && data.stats.topDepenses.length > 0) {
    if (y > 230) {
      doc.addPage();
      y = margin;
    }
    setFont("bold");
    doc.setFontSize(13);
    doc.setTextColor(...slate);
    doc.text("Top dépenses", margin, y);
    y += 6;
    doc.setDrawColor(...lightSlate);
    doc.line(margin, y, W - margin, y);
    y += 5;

    setFont("bold");
    doc.setFontSize(9);
    doc.setTextColor(...lightSlate);
    doc.text("Date", margin, y);
    doc.text("Fournisseur / Numéro", margin + 22, y);
    doc.text("Catégorie", margin + 100, y);
    doc.text("Montant TTC", W - margin, y, { align: "right" });
    y += 4;
    doc.line(margin, y, W - margin, y);
    y += 4;

    setFont("normal");
    doc.setFontSize(9);
    for (const d of data.stats.topDepenses.slice(0, 10)) {
      if (y > 270) {
        doc.addPage();
        y = margin;
      }
      doc.setTextColor(30, 41, 59);
      const dateStr = d.date_depense ? new Date(d.date_depense).toLocaleDateString("fr-FR") : "—";
      doc.text(dateStr, margin, y);
      const lib = (d.fournisseur || d.numero || "—").slice(0, 36);
      doc.text(lib, margin + 22, y);
      doc.text(String(d.categorie || "").slice(0, 24), margin + 100, y);
      doc.text(eurFmt(d.montant_ttc), W - margin, y, { align: "right" });
      y += 5;
    }
  }

  /** ============ FOOTER (sur chaque page) ============ */
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    setFont("normal");
    doc.setFontSize(8);
    doc.setTextColor(...lightSlate);
    doc.text(
      `Généré par Operioz le ${new Date().toLocaleDateString("fr-FR")} — Page ${p} / ${pageCount}`,
      W / 2,
      290,
      { align: "center" }
    );
  }

  doc.save(`Rapport-depenses-${data.mois}.pdf`);
}
