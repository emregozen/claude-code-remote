import Fastify from "fastify";

export async function createHookServer(): Promise<{ close: () => Promise<void> }> {
  const fastify = Fastify({ logger: false });

  fastify.post("/hook/stop", async (request, reply) => {
    await reply.status(200).send({ ok: true });
  });

  await fastify.listen({ port: 4711, host: "127.0.0.1" });
  console.log("✓ Hook server listening on 127.0.0.1:4711");

  return {
    close: () => fastify.close(),
  };
}
