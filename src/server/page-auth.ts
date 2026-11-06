import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE, isAuthed } from './guard';

export async function hasAuth(): Promise<boolean> {
  return isAuthed((await cookies()).get(AUTH_COOKIE)?.value);
}

export async function requireAuth() {
  if (!(await hasAuth())) redirect('/login');
}
