# OPE-295 — Plan d'implémentation SAE tiers (si requis)

**Date** : 2026-06-27  
**Contexte** : Cas où SuperPDP n'archive PAS 10 ans → intégrer un SAE externe  
**Audience** : Tech

---

## Architecture cible (SAE tiers)

```
Operioz API
    ↓
    ├─→ SuperPDP (transmission PA, formats Factur-X/PDF-A3)
    │   └─→ événements + statuts
    │
    └─→ SAE Tiers [NEW] (archivage 10 ans probant)
        ├─ Upload Factur-X après émission SuperPDP
        ├─ Stockage sécurisé + horodatage RFC 3161
        ├─ Piste d'audit + certificats de dépôt
        └─ Export reversibilité (Factur-X, PDF/A-3)
```

---

## SAE recommandé : ADSN (meilleur rapport coût/intégration)

| Critère | ADSN | Libeo | Universign | SFIB |
|---------|------|-------|-----------|------|
| **API REST** | ✅ | SOAP | ✅ | ❌ |
| **Pricing** | 0,01€/doc | 200k€/an | Unclear | 100€/an |
| **NF Z42-013** | ✅ (en cours) | ✅ | ✅ | ✅ |
| **Time-to-integrate** | **2-3j** | 2-3w | 1-2w | N/A |
| **Scalability** | ✅✅ | ✅ | ✅ | ❌ |

### Raison ADSN
- API REST moderne (swagger public)
- Horodatage automatique embarqué
- Coût marginal (<1€/mois pour artisan moyen)
- Reversibilité garantie (export ZIP Factur-X)
- Startup agile → adaptabilité

---

## Architecture technique Operioz

### 1. Abstraction `ArchivagePort` (parallèle `PaPort`)

```typescript
// apps/api/modules/einvoicing/application/archivage-port.ts

export interface ArchivagePort {
  /** Upload document pour archivage longue durée. */
  archiveInvoice(input: ArchiveInvoiceInput): Promise<{
    archiveId: string;
    certificateUrl?: string;
  }>;

  /** Vérifier existence + intégrité. */
  verifyArchive(archiveId: string): Promise<{
    status: "archived" | "pending" | "failed";
    checksumSha256?: string;
    horodatageDate?: Date;
  }>;

  /** Export reversibilité. */
  exportArchive(archiveId: string): Promise<Buffer>;
}

export interface ArchiveInvoiceInput {
  facturxBase64: string;
  pdfA3Base64?: string;
  metadata: {
    paDocumentId: string;
    numero: string;
    date: Date;
    emetteurSiret: string;
    destinataireSiret: string;
    montantTTC: number;
  };
}
```

### 2. Adapter ADSN

```typescript
// apps/api/shared/ports/adsn-archivage-adapter.ts

export class AdsnArchivageAdapter implements ArchivagePort {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = "https://api.adsn.fr/v1"
  ) {}

  async archiveInvoice(input: ArchiveInvoiceInput): Promise<...> {
    // POST /archives
    // - upload facturxBase64 (ou pdfA3Base64)
    // - metadata JSON
    // - ADSN génère horodatage RFC 3161 automatique
    // ← archiveId + certificat
  }

  async verifyArchive(archiveId: string): Promise<...> {
    // GET /archives/{archiveId}
    // vérifier status + checksumSha256 + horodatageDate
  }

  async exportArchive(archiveId: string): Promise<Buffer> {
    // GET /archives/{archiveId}/export
    // ← ZIP : Factur-X + Certificat + Horodatage
  }
}
```

### 3. Workflow Operioz : après émission SuperPDP

```typescript
// apps/api/shared/infra/pa-archivage-drainer.ts

/** Poller PA outbox → archiver après émission conforme. */
export async function paArchivageDrainerPlugin(ctx: PipelineContext) {
  const pa = ctx.get<PaPort>("paPort");
  const archivage = ctx.get<ArchivagePort>("archivagePort"); // null si SuperPDP suffisant

  const outbox = await db.query.paOutbox.findMany({
    where: eq(schema.paOutbox.status, "emise"),
    limit: 100,
  });

  for (const row of outbox) {
    try {
      const facture = await db.query.factures.findOne({
        where: eq(schema.factures.id, row.factureId),
      });

      if (archivage && facture.facturxBase64) {
        // Archive en parallèle SuperPDP (non-bloquant)
        const archive = await archivage.archiveInvoice({
          facturxBase64: facture.facturxBase64,
          metadata: {
            paDocumentId: row.paDocumentId,
            numero: facture.numero,
            date: facture.date,
            emetteurSiret: facture.emetteurSiret,
            destinataireSiret: facture.destinataireSiret,
            montantTTC: facture.totalTTC,
          },
        });

        // Stocker archiveId → liaison facture ↔ SAE
        await db.update(schema.factures)
          .set({ archiveId: archive.archiveId })
          .where(eq(schema.factures.id, facture.id));
      }

      await db.update(schema.paOutbox)
        .set({ status: "archivee", archivedAt: new Date() })
        .where(eq(schema.paOutbox.id, row.id));
    } catch (err) {
      log.error("archivage échoué", { factureId: row.factureId, err });
      await db.update(schema.paOutbox)
        .set({ status: "archivage_error", errorMessage: err.message })
        .where(eq(schema.paOutbox.id, row.id));
    }
  }
}
```

### 4. Routes tRPC : exportation reversibilité

```typescript
// apps/api/modules/einvoicing/interface/trpc/archivage.router.ts

export const archivageRouter = t.router({
  /** Exporter facture archivée (reversibilité). */
  exportArchive: t.procedure
    .input(z.object({ factureId: z.string() }))
    .query(async ({ input, ctx }) => {
      const facture = await db.query.factures.findOne({
        where: eq(schema.factures.id, input.factureId),
      });
      if (!facture?.archiveId) throw new Error("Pas d'archive trouvée");
      if (facture.artisanId !== ctx.tenant) throw new Error("Unauthorized");

      const archivage = ctx.get<ArchivagePort>("archivagePort");
      const zip = await archivage.exportArchive(facture.archiveId);

      return {
        fileName: `facture-${facture.numero}-archive.zip`,
        base64: zip.toString("base64"),
      };
    }),

  /** Vérifier intégrité archive (test de conformité). */
  verifyArchive: t.procedure
    .input(z.object({ factureId: z.string() }))
    .query(async ({ input, ctx }) => {
      const facture = await db.query.factures.findOne({
        where: eq(schema.factures.id, input.factureId),
      });
      if (!facture?.archiveId) return null;
      if (facture.artisanId !== ctx.tenant) throw new Error("Unauthorized");

      const archivage = ctx.get<ArchivagePort>("archivagePort");
      return archivage.verifyArchive(facture.archiveId);
    }),
});
```

---

## Schéma DB : columns archivage

```typescript
// drizzle/pg/XXXX_add-archivage-columns.ts (custom migration)

const factures = createTable("factures", (t) => ({
  // ... colonnes existantes ...

  // Archivage SAE tiers
  archiveId: t.string().unique(), // ID chez SAE (ex: ADSN)
  archiveCertificateUrl: t.string(), // certificat horodaté
  archiveVerifiedAt: t.timestamp(), // dernière vérif d'intégrité
  archiveStatus: t.enum(["pending", "archived", "failed"]).default("pending"),
}));

const paOutbox = createTable("pa_outbox", (t) => ({
  // ... colonnes existantes ...

  // Tracking archivage
  archivedAt: t.timestamp(), // quand archivé
  archiveErrorMessage: t.string(), // en cas d'erreur
  status: t.enum([
    "pending",
    "emise",
    "archivee", // [NEW] archivage réussi
    "archivage_error", // [NEW] archivage échoué (retry)
    "delivered",
  ]),
}));
```

---

## Intégration configuration

### Environment

```bash
# .env
ARCHIVAGE_PROVIDER=adsn # ou null si SuperPDP seul
ADSN_API_KEY=... # requis si ADSN
ADSN_BASE_URL=https://api.adsn.fr/v1
```

### Bootstrap App

```typescript
// apps/api/app.ts

const archivage = env.ARCHIVAGE_PROVIDER === "adsn"
  ? new AdsnArchivageAdapter(env.ADSN_API_KEY, env.ADSN_BASE_URL)
  : null; // null = SuperPDP suffisant

ctx.set("archivagePort", archivage);
```

---

## Tests

### L2 (repo + archivage fake)

```typescript
// apps/api/modules/einvoicing/infra/fake-archivage-adapter.ts

export class FakeArchivageAdapter implements ArchivagePort {
  private archives = new Map<string, ArchiveInvoiceInput>();

  async archiveInvoice(input: ArchiveInvoiceInput) {
    const archiveId = `fake-archive-${Date.now()}`;
    this.archives.set(archiveId, input);
    return { archiveId, certificateUrl: null };
  }

  async verifyArchive(archiveId: string) {
    return this.archives.has(archiveId)
      ? { status: "archived" as const, checksumSha256: "fake-sha" }
      : null;
  }

  async exportArchive(archiveId: string): Promise<Buffer> {
    return Buffer.from("PK..."); // fake ZIP
  }
}
```

### L3 (e2e sandbox ADSN)

```typescript
// apps/api/modules/einvoicing/einvoicing.test.ts

it("archivage : upload ADSN après émission SuperPDP", async () => {
  // 1. créer facture
  // 2. soumettre SuperPDP
  // 3. attendre emission (status fr:200)
  // 4. poller archivage-drainer
  // 5. vérifier archiveId stocké
  // 6. tester export reversibilité
  // 7. vérifier intégrité checksum
});
```

---

## Timeline d'implémentation

| Phase | Délai | Travail |
|-------|-------|---------|
| **Phase 0** (en cours) | 48h | Attendre réponse SuperPDP archivage |
| **Phase 1** (si SAE requis) | 2-3j | Adapter ADSN + workflow + DB |
| **Phase 2** | 1j | Tests L2 + L3 sandbox ADSN |
| **Phase 3** | 1j | Intégration crons + monitoring |
| **Phase 4** | 1j | Documentation + reversibilité playbook |
| **Phase 5** | Avant go-live | Audit conformité NF Z42-013 |

**Total si SAE requis** : ~1 semaine

---

## Risques mitigation

| Risque | Mitigation |
|--------|-----------|
| ADSN indisponible | Failover retry + fallback lokal (buffer factures) |
| Certificat horodatage perdu | Restorage en ligne depuis API ADSN (GET /archives) |
| Coût ADSN incontrôlé | Budget 100€/an max pour 10k factures/an (scalable) |
| Changement de SAE | Export ZIP + import nouveau SAE (réversibilité) |

---

## Décision finale : Operioz Métier + Legal

- [ ] SuperPDP conforme 10 ans ? → **OUI** : Noop  
- [ ] SuperPDP conforme 10 ans ? → **NON** : Lancer Phase 1 SAE ADSN  
- [ ] SuperPDP conforme 10 ans ? → **AMBIGU** : Prudence → SAE parallèle  

---

## Annexe : commandes de test

```bash
# Vérifier certificat horodatage dans Factur-X
unzip -l facture.zip | grep -i "timestamp\|tsa\|signature"
strings facture.pdf | grep -i "SignatureTime\|M\(D5\|SHA256\)"

# Tester export ADSN
curl -H "Authorization: Bearer $ADSN_API_KEY" \
  https://api.adsn.fr/v1/archives/archive-123/export \
  -o export.zip && unzip -t export.zip
```
