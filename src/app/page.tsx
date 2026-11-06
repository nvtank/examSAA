import { requireAuth } from '@/server/page-auth';
import { AppHeader } from '@/components/AppHeader';
import { Dashboard } from '@/components/Dashboard';

export default async function Home() {
  await requireAuth();
  return (
    <>
      <AppHeader />
      <Dashboard />
    </>
  );
}
