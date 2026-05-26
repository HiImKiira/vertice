/**
 * /api/ping — endpoint mínimo para que el cliente verifique que tiene red.
 *
 * El cliente usa este endpoint cuando `navigator.onLine` reporta `false`
 * para confirmar si realmente no hay red (true offline) o si el browser
 * está dando un falso positivo (caso común en Android 4G/5G).
 *
 * Devuelve 204 No Content. No requiere autenticación. Edge runtime para
 * latencia mínima.
 */
export const runtime = "edge";
export const dynamic = "force-dynamic";

function ok() {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Vortex-Ping": "1",
    },
  });
}

export async function GET() { return ok(); }
export async function HEAD() { return ok(); }
