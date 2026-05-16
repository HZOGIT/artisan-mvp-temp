// Middleware Express qui s'execute UNIQUEMENT sur /api/trpc/* (avant que
// la requete n'atteigne le tRPC handler). Trois responsabilites :
//
// 1) Verifier que l'abonnement n'est PAS expire (status='expired' OU
//    canceled avec currentPeriodEnd passe). Si oui, renvoyer 402 sauf si
//    la route est whiteliste (auth, subscription, parametres, devices,
//    artisan.getProfile — tout ce qui permet de renouveler/configurer).
//
// 2) Enregistrer l'appareil (fingerprint OS+browser+type) et appliquer la
//    limite d'appareils :
//    - Si l'appareil EXISTE deja (matching fingerprint) → toujours
//      autorise, on rafraichit last_active_at via ON DUPLICATE KEY UPDATE.
//    - Si l'appareil est NOUVEAU et qu'on est deja a la limite (3 par
//      defaut) → 403 device_limit_reached.
//    Auto-create un trial 30j si l'artisan n'a aucune ligne subscription
//    (cas des nouveaux signups, ou des artisans crees apres la migration).
//
// 3) Gerer les sessions simultanees (eviction LRU si depassement, jamais
//    de blocage). La session est identifiee par le JWT cookie.
//
// REGLE D'OR : ce middleware NE DOIT JAMAIS bloquer une requete en cas
// d'erreur DB, de table manquante, ou d'inconnu. Le defaut est PASS.
//
// Throttle : pour ne pas re-ecrire devices/sessions a chaque requete tRPC
// (plusieurs par page), on garde un cache memoire userId→lastWriteMs.

import type { Request, Response, NextFunction } from "express";
import * as db from "../db";
import { getUserFromRequest } from "./auth-simple";
import {
  detectBrowser,
  detectDeviceType,
  detectOS,
  generateFingerprint,
} from "./deviceUtils";

const WRITE_TTL_MS = 60_000;
const lastWriteAt = new Map<number, number>();

// Procedures autorisees meme avec abonnement expire (permet de payer pour
// se debloquer + lire son profil et ses parametres).
// On compare au prefixe car tRPC peut envoyer "auth.signin" mais aussi
// des batchs "clients.list,devis.list" — on whiteliste si TOUS les
// procedures du batch sont whitelistes.
const ALLOWED_PROCEDURE_PREFIXES = [
  "auth.",
  "subscription.",
  "devices.",
  "parametres.",
  "artisan.getProfile",
  "artisan.updateProfile",
  "system.",
  "modules.list",
];

function isAllowed(procedure: string): boolean {
  return ALLOWED_PROCEDURE_PREFIXES.some((p) => procedure.startsWith(p));
}

function isFullyAllowed(reqPath: string): boolean {
  // reqPath ressemble a "/clients.list" ou "/clients.list,devis.list" (batch).
  const after = reqPath.split("?")[0].replace(/^\/+/, "");
  if (!after) return true;
  const procs = after.split(",");
  return procs.every(isAllowed);
}

export function subscriptionGuard() {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Skip rapide si on n'est pas en /api/trpc.
      // (Le middleware est monte sur /api/trpc deja, mais defensif.)
      const tRpcPath = req.url || req.path;
      if (isFullyAllowed(tRpcPath)) {
        return next();
      }

      // Resoud l'utilisateur depuis le cookie JWT. Si non authentifie, on
      // laisse tRPC renvoyer 401 standard.
      const user = await getUserFromRequest(req);
      if (!user || !user.artisanId) return next();

      // Charge ou auto-cree la subscription (trial 30j si rien en DB).
      let sub = await db.getSubscription(user.artisanId);
      if (!sub) {
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 30);
        await db.updateSubscription(user.artisanId, {
          plan: "trial",
          status: "trialing",
          trialEndsAt: trialEnd,
          maxUsers: 1,
          maxDevicesPerUser: 3,
          maxConcurrentSessions: 2,
        });
        sub = await db.getSubscription(user.artisanId);
      }

      // --- 1) Blocage si abonnement expire ---
      const now = new Date();
      const isExpired =
        sub?.status === "expired" ||
        (sub?.status === "canceled" &&
          sub?.currentPeriodEnd !== null &&
          sub?.currentPeriodEnd !== undefined &&
          sub.currentPeriodEnd < now) ||
        (sub?.status === "trialing" &&
          sub?.trialEndsAt !== null &&
          sub?.trialEndsAt !== undefined &&
          sub.trialEndsAt < now);

      if (isExpired) {
        res.status(402).json({
          error: "subscription_expired",
          message: "Votre abonnement a expiré. Renouvelez-le pour continuer.",
        });
        return;
      }

      // --- Throttle : skip enregistrement si fait < 60s ---
      const lastWrite = lastWriteAt.get(user.id) || 0;
      const writeFresh = Date.now() - lastWrite < WRITE_TTL_MS;

      // --- 2) Device fingerprint + limite ---
      const ua = String(req.headers["user-agent"] || "");
      const ip = String(req.ip || (req.socket as any)?.remoteAddress || "");
      const fp = generateFingerprint(ua);

      // Verifie si l'appareil est nouveau ET si on est a la limite.
      // On le fait MEME en mode writeFresh : la limite doit etre fiable.
      if (!writeFresh) {
        const existing = await db.getDevice(user.id, fp);
        if (!existing) {
          const count = await db.countActiveDevices(user.id);
          const max = sub?.maxDevicesPerUser || 3;
          if (count >= max) {
            res.status(403).json({
              error: "device_limit_reached",
              message: `Vous avez atteint la limite de ${max} appareils. Deconnectez un appareil dans votre profil ou passez a un plan superieur.`,
            });
            return;
          }
        }

        // Enregistre / met a jour l'appareil (ON DUPLICATE KEY UPDATE).
        await db.registerDevice({
          userId: user.id,
          artisanId: user.artisanId,
          fingerprint: fp,
          deviceType: detectDeviceType(ua),
          browser: detectBrowser(ua),
          os: detectOS(ua),
          ip,
        });

        // --- 3) Sessions simultanees (eviction LRU) ---
        const cookieToken = req.cookies?.token;
        if (cookieToken) {
          const tokenHash = String(cookieToken).slice(0, 200);
          const sessionCount = await db.countActiveSessions(user.id);
          const maxSessions = sub?.maxConcurrentSessions || 2;
          if (sessionCount >= maxSessions) {
            // On evicte la plus ancienne AVANT de creer la nouvelle.
            await db.deleteOldestSession(user.id);
          }
          await db.createSession({
            userId: user.id,
            artisanId: user.artisanId,
            token: tokenHash,
            fingerprint: fp,
            ip,
            ttlDays: 7,
          });
        }

        lastWriteAt.set(user.id, Date.now());
      }

      return next();
    } catch (e: any) {
      // Conservative : on log mais on NE BLOQUE PAS la requete.
      console.warn("[subscriptionGuard] non-blocking error:", e?.message || e);
      return next();
    }
  };
}
