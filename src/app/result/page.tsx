import { requireAuth } from '@/server/page-auth';
import { AppHeader } from '@/components/AppHeader';
import { ResultView } from '@/components/ResultView';

export default async function ResultPage() {
  await requireAuth();
  return (
    <>
      <AppHeader />
      <ResultView />
    </>
  );
}
