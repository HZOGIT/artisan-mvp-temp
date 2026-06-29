import QRCode from "qrcode";
import { round2 } from "../money";

export interface EpcInput {
  beneficiary: string;
  iban: string;
  bic?: string | null;
  amountEur: number;
  reference?: string | null;
}

/**
 * Construit la chaîne EPC SCT v002 (EPC069-12).
 * Retourne null si les champs obligatoires (iban, beneficiary) sont absents.
 */
export function buildEpcPayload(input: EpcInput): string | null {
  const iban = input.iban.replace(/\s/g, "").toUpperCase();
  const name = (input.beneficiary ?? "").slice(0, 70).trim();
  if (!iban || !name) return null;

  const amount = `EUR${round2(Math.max(0.01, input.amountEur)).toFixed(2)}`;
  const bic = (input.bic ?? "").replace(/\s/g, "").toUpperCase();
  const ref = (input.reference ?? "").slice(0, 140);

  return ["BCD", "002", "1", "SCT", bic, name, iban, amount, "", "", ref].join("\n");
}

/** Retourne un buffer PNG du QR code EPC, ou null si le payload est invalide. */
export async function epcQrPngBuffer(input: EpcInput): Promise<Buffer | null> {
  const payload = buildEpcPayload(input);
  if (!payload) return null;
  return QRCode.toBuffer(payload, { errorCorrectionLevel: "M", margin: 1 });
}
