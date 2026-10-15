import { createApplication } from "./bootstrap";

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  await app.listen(parsePort(process.env.PORT));
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return 3000;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  return parsed;
}

void bootstrap();
