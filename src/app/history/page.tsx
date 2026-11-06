import { requireAuth } from '@/server/page-auth';
import { AppHeader } from '@/components/AppHeader';
import { HistoryView } from '@/components/HistoryView';

export default async function HistoryPage() {
  await requireAuth();
  return (
    <>
      <AppHeader />
      <HistoryView />
    </>
  );
}
