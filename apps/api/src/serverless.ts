import serverless from "serverless-http";
import { createApplication } from "./bootstrap";

type LambdaHandler = ReturnType<typeof serverless>;
let initialization: Promise<LambdaHandler> | undefined;

async function initialize(): Promise<LambdaHandler> {
  const app = await createApplication(true);
  try {
    await app.init();
    return serverless(app.getHttpAdapter().getInstance(), {
      binary: ["application/pdf", "application/octet-stream", "image/*"],
    });
  } catch (error) {
    await app.close().catch(() => undefined);
    throw error;
  }
}

export function normalizeFunctionPath(path: string): string {
  for (const prefix of ["/.netlify/functions/api", "/api"]) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return path.slice(prefix.length) || "/";
  }
  return path;
}

export const handler = async (event: { path: string; [key: string]: unknown }, context: { callbackWaitsForEmptyEventLoop?: boolean }) => {
  context.callbackWaitsForEmptyEventLoop = false;
  initialization ??= initialize().catch((error: unknown) => {
    initialization = undefined;
    throw error;
  });
  const handle = await initialization;
  const result = await handle({ ...event, path: normalizeFunctionPath(event.path) }, context) as { statusCode: number; headers: Record<string, string>; body: string; isBase64Encoded: boolean };
  if (Buffer.byteLength(JSON.stringify(result)) > 6_000_000) {
    const corsHeaders = Object.fromEntries(Object.entries(result.headers).filter(([key]) => key.startsWith("access-control-") || key === "vary"));
    return { statusCode: 413, headers: { ...corsHeaders, "content-type": "application/json", "cache-control": "no-store", "content-disposition": "inline" }, body: JSON.stringify({ message: "La respuesta supera el limite de Netlify. Genera el PDF y utiliza su URL firmada para descargarlo." }), isBase64Encoded: false };
  }
  return result;
};
