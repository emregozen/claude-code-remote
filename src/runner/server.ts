import Fastify from "fastify";

export interface PermissionRequest {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

export type PermissionHandler = (req: PermissionRequest) => Promise<boolean>;

export interface HookServer {
  setPermissionHandler(handler: PermissionHandler | null): void;
}

export async function createHookServer(port = 4711): Promise<HookServer> {
  let permissionHandler: PermissionHandler | null = null;

  const fastify = Fastify({ logger: false });

  fastify.post("/hook/stop", async (_request, reply) => {
    await reply.status(200).send({ ok: true });
  });

  fastify.post("/hook/permission", async (request, reply) => {
    const body = request.body as PermissionRequest;

    if (!permissionHandler) {
      await reply.status(200).send({ approved: true });
      return;
    }

    const approved = await permissionHandler(body);
    await reply.status(200).send({ approved });
  });

  await fastify.listen({ port, host: "127.0.0.1" });

  return {
    setPermissionHandler(handler) {
      permissionHandler = handler;
    },
  };
}
