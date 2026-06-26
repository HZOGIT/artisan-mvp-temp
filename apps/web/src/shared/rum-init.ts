import type { Metric } from "web-vitals";
import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import { apiUrl } from "./backend-url";

function sendMetric(metric: Metric): void {
  try {
    navigator.sendBeacon(
      apiUrl("/api/vitals"),
      JSON.stringify({ name: metric.name, value: metric.value, rating: metric.rating, id: metric.id }),
    );
  } catch {
    /* fire-and-forget */
  }
}

/** Initialise la collecte RUM (Web Vitals) — appeler une seule fois au boot. */
export function initRum(): void {
  onCLS(sendMetric);
  onFCP(sendMetric);
  onINP(sendMetric);
  onLCP(sendMetric);
  onTTFB(sendMetric);
}
