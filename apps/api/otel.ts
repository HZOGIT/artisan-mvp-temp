import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const sdk = new NodeSDK({
  serviceName: "operioz-new-stack",
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://otel-collector:4318/v1/traces",
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-pg": { enabled: true },
      "@opentelemetry/instrumentation-fastify": { enabled: true },
      "@opentelemetry/instrumentation-http": { enabled: true },
    }),
  ],
});

sdk.start();

process.on("SIGTERM", () => {
  sdk.shutdown().catch(() => void 0);
});
