import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { constantTimeEqual } from "../_shared/crypto.ts";
import { errorResponse, HttpError, json, methodNotAllowed, parseJson } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { DEFAULT_QUEUES, drainQueues } from "../_shared/worker.ts";

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return methodNotAllowed(["POST"]);
    const configured = Deno.env.get("AZWA_WORKER_SECRET");
    const supplied = req.headers.get("x-azwa-worker-secret");
    if (!configured || !supplied || !constantTimeEqual(configured, supplied)) {
      throw new HttpError(401, "Invalid worker credential", "unauthorized");
    }
    const body = await parseJson<any>(req).catch(() => ({}));
    const queues = Array.isArray(body.queues) && body.queues.length ? body.queues.map(String) : DEFAULT_QUEUES;
    const result = await drainQueues(serviceClient(), {
      workerId: `worker:${crypto.randomUUID()}`,
      queues,
      batchSize: Number(body.batch_size ?? 20),
      maxBatches: Number(body.max_batches ?? 10),
      maxRuntimeMs: Number(body.max_runtime_ms ?? 45_000),
    });
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
});
