export interface HealthStatus {
  status: "ok" | "degraded";
  service: "ggs-document-studio-api";
  database: "not_configured" | "connected" | "unreachable";
}
