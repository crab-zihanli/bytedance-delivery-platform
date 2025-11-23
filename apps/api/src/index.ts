import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { config } from "./config";
import { db } from "./db";

const fastify = Fastify({
  logger: true,
});

// Register plugins
await fastify.register(helmet);
await fastify.register(cors, {
  origin: true,
});

// Health check route
fastify.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

// Example route
fastify.get("/api/users", async (_request, reply) => {
  try {
    const result = await db.query("SELECT * FROM users LIMIT 10");
    return { users: result.rows };
  } catch (error) {
    fastify.log.error(error);
    reply.code(500).send({ error: "Internal server error" });
  }
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: "0.0.0.0" });
    fastify.log.info(`Server listening on port ${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
