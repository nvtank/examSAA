import { redirect } from 'next/navigation';
import { hasAuth } from '@/server/page-auth';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  if (await hasAuth()) redirect('/');
  return <LoginForm />;
}
