import Fastify from "fastify";

export async function createHookServer(port: number = 4711): Promise<void> {
  const fastify = Fastify({ logger: false });

  fastify.post("/hook/stop", async (request, reply) => {
    await reply.status(200).send({ ok: true });
  });

  await fastify.listen({ port, host: "127.0.0.1" });
}
