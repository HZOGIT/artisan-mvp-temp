// Flux iCal d'abonnement au calendrier des interventions. Le jeton (`icalToken`) vit sur l'artisan
// (table d'identité) ; le chemin public est servi hors tRPC (route `/api/calendar/:token.ics`).
export interface IcalFeed {
  readonly path: string;
}

// Chemin d'abonnement à partir du jeton (le front préfixe l'origine). Fonction PURE.
export function icalPath(token: string): string {
  return `/api/calendar/${token}.ics`;
}

// Évènement de calendrier (intervention enrichie du client) à sérialiser en VEVENT. Découplé Drizzle.
export interface IcalEvent {
  readonly id: number;
  readonly titre: string | null;
  readonly dateDebut: Date;
  readonly dateFin: Date | null;
  readonly adresse: string | null;
  readonly description: string | null;
  readonly statut: string | null;
  readonly clientNom: string | null;
  readonly clientTelephone: string | null;
}

// Échappement de texte iCal (RFC 5545 : backslash, point-virgule, virgule, newline). Fonction PURE.
export function icalText(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Date iCal UTC compacte (`YYYYMMDDTHHMMSSZ`). Fonction PURE.
export function icalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

// Sérialise le flux VCALENDAR (parité legacy `/api/calendar/:token.ics`). PURE : prend les évènements
// déjà filtrés/scopés. Une intervention sans `dateFin` → +1 h. `statut=annulee` → `CANCELLED`.
export function buildIcalFeed(input: { calName: string; events: readonly IcalEvent[]; now?: Date }): string {
  const stamp = icalDate(input.now ?? new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Operioz//Interventions//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icalText(`Operioz — ${input.calName || "Interventions"}`)}`,
  ];
  for (const i of input.events) {
    const debut = i.dateDebut;
    const fin = i.dateFin ?? new Date(debut.getTime() + 60 * 60_000);
    const descParts = [
      i.description ?? "",
      i.clientNom ? `Client : ${i.clientNom}` : "",
      i.clientTelephone ? `Tél : ${i.clientTelephone}` : "",
    ].filter(Boolean);
    lines.push(
      "BEGIN:VEVENT",
      `UID:operioz-intervention-${i.id}@operioz.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icalDate(debut)}`,
      `DTEND:${icalDate(fin)}`,
      `SUMMARY:${icalText(i.titre || "Intervention")}`,
      ...(i.adresse ? [`LOCATION:${icalText(i.adresse)}`] : []),
      ...(descParts.length ? [`DESCRIPTION:${icalText(descParts.join("\n"))}`] : []),
      `STATUS:${i.statut === "annulee" ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
