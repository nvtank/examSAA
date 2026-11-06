import { getBank } from '@/server/bank';
import { guard, json } from '@/server/guard';
import type { Catalog } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guard(req);
  if (g instanceof Response) return g;
  const bank = getBank();
  const cat: Catalog = {
    totalQuestions: bank.sets.reduce((a, s) => a + s.count, 0),
    sources: bank.sources.map((s) => ({
      ...s,
      sets: bank.sets
        .filter((x) => x.source === s.id)
        .map(({ id, source, title, count, domains }) => ({ id, source, title, count, domains })),
    })),
  };
  return json(cat);
}
