import 'server-only';

type Result = { ok: boolean; used: number; limit: number; retryAfter: number };

const mem = new Map<string, { n: number; exp: number }>();
let lastSweep = 0;

function memHit(key: string, windowSec: number, cost: number): number {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, v] of mem) if (v.exp < now) mem.delete(k);
  }
  const e = mem.get(key);
  if (!e || e.exp < now) {
    mem.set(key, { n: cost, exp: now + windowSec * 2000 });
    return cost;
  }
  e.n += cost;
  return e.n;
}

async function redisHit(key: string, windowSec: number, cost: number): Promise<number | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCRBY', key, String(cost)],
        ['EXPIRE', key, String(windowSec * 2)],
      ]),
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { result?: number }[];
    return typeof j?.[0]?.result === 'number' ? j[0].result : null;
  } catch {
    return null; // Redis lỗi -> rơi về bộ nhớ trong instance (không fail-open hoàn toàn)
  }
}

/**
 * Cửa sổ cố định. Dùng Upstash Redis nếu có cấu hình (giới hạn toàn cục giữa các instance),
 * nếu không thì dùng bộ nhớ trong từng instance (best-effort).
 */
export async function rateLimit(name: string, id: string, limit: number, windowSec: number, cost = 1): Promise<Result> {
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const key = `cep:${name}:${id}:${bucket}`;
  const used = (await redisHit(key, windowSec, cost)) ?? memHit(key, windowSec, cost);
  const retryAfter = windowSec - (Math.floor(Date.now() / 1000) % windowSec);
  return { ok: used <= limit, used, limit, retryAfter };
}
