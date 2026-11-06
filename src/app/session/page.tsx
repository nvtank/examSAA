import { requireAuth } from '@/server/page-auth';
import { SessionRunner } from '@/components/SessionRunner';

export default async function SessionPage() {
  await requireAuth();
  return <SessionRunner />;
}
