import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import LoginForm from '@/components/LoginForm/LoginForm';
import { getAuthService, safeNextPath, SESSION_COOKIE } from '@/lib/auth';

export const metadata: Metadata = { title: 'Sign in · Music UI' };

export default async function LoginPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { next } = await searchParams;
  const target = safeNextPath(typeof next === 'string' ? next : undefined);
  const auth = getAuthService();
  if (!auth.enabled) redirect(target);

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token && auth.repository.getSession(token, auth.sessionDays)) redirect(target);

  return <LoginForm next={target} noUsers={auth.repository.userCount() === 0} />;
}
