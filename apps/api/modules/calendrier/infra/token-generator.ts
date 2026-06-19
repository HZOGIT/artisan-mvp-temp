import { randomBytes } from "node:crypto";
import type { TokenGenerator } from "../application/ical-feed-repository";

/*
 * Générateur par défaut : 48 caractères hexadécimaux non devinables (parité legacy
 * `randomBytes(24).toString("hex")` ; tient dans `artisans.icalToken` varchar(64)).
 */
export const randomHexToken: TokenGenerator = () => randomBytes(24).toString("hex");
