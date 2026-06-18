import { describe, it, expect } from "vitest";
import { icalPath, icalText, icalDate, buildIcalFeed, type IcalEvent } from "./ical";

describe("icalPath (pur)", () => {
  it("construit le chemin d'abonnement à partir du jeton", () => {
    expect(icalPath("abc123")).toBe("/api/calendar/abc123.ics");
  });
});

describe("icalText / icalDate (purs)", () => {
  it("icalText échappe backslash/point-virgule/virgule/newline", () => {
    expect(icalText("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
    expect(icalText(null)).toBe("");
  });
  it("icalDate : format UTC compact YYYYMMDDTHHMMSSZ", () => {
    expect(icalDate(new Date("2026-06-15T09:30:00.000Z"))).toBe("20260615T093000Z");
  });
});

describe("buildIcalFeed (pur)", () => {
  const event = (over: Partial<IcalEvent> = {}): IcalEvent => ({
    id: 1,
    titre: "Dépannage",
    dateDebut: new Date("2026-06-15T08:00:00Z"),
    dateFin: new Date("2026-06-15T10:00:00Z"),
    adresse: "1 rue Test",
    description: "Fuite",
    statut: "planifiee",
    clientNom: "Jean Dupont",
    clientTelephone: "0600000000",
    ...over,
  });
  const NOW = new Date("2026-06-15T07:00:00Z");

  it("sérialise un VCALENDAR avec en-tête + VEVENT", () => {
    const ics = buildIcalFeed({ calName: "Plomberie X", events: [event()], now: NOW });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("X-WR-CALNAME:Operioz — Plomberie X");
    expect(ics).toContain("UID:operioz-intervention-1@operioz.com");
    expect(ics).toContain("DTSTART:20260615T080000Z");
    expect(ics).toContain("DTEND:20260615T100000Z");
    expect(ics).toContain("SUMMARY:Dépannage");
    expect(ics).toContain("LOCATION:1 rue Test");
    expect(ics).toContain("DESCRIPTION:Fuite\\nClient : Jean Dupont\\nTél : 0600000000");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("dateFin absente → +1 h ; statut annulee → CANCELLED ; sans adresse → pas de LOCATION", () => {
    const ics = buildIcalFeed({ calName: "X", events: [event({ dateFin: null, statut: "annulee", adresse: null })], now: NOW });
    expect(ics).toContain("DTSTART:20260615T080000Z");
    expect(ics).toContain("DTEND:20260615T090000Z"); // +1h
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).not.toContain("LOCATION:");
  });

  it("aucun évènement → calendrier vide valide", () => {
    const ics = buildIcalFeed({ calName: "X", events: [], now: NOW });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});
