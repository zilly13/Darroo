import "dotenv/config";
import formbody from "@fastify/formbody";
import Fastify from "fastify";
import { registerInternalRoutes, registerPublicRoutes } from "../posting/routes.js";
import { logger } from "../utils/logger.js";
import { startScheduler } from "./scheduler.js";

async function main() {
  const app = Fastify({ logger: false });
  await app.register(formbody);

  await registerPublicRoutes(app);
  await registerInternalRoutes(app);

  startScheduler();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
  logger.info({ port }, "darroo server listening");
}

main().catch((err) => {
  logger.error({ err }, "Server failed to start");
  process.exit(1);
});
