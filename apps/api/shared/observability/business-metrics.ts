import { Counter } from "prom-client";

/* Business metrics — KPIs métier en temps réel pour Grafana. */

export const devisCounter = new Counter({
  name: "devis_total",
  help: "Devis créés, acceptés, refusés, expirés",
  labelNames: ["action"],
});

export const factureCounter = new Counter({
  name: "facture_total",
  help: "Factures créées, émises, payées",
  labelNames: ["action"],
});

export const signatureCounter = new Counter({
  name: "signature_total",
  help: "Devis signés par les clients",
  labelNames: ["action"],
});

export const portailCounter = new Counter({
  name: "portail_total",
  help: "Accès portail client et paiements initiés",
  labelNames: ["action"],
});
