'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { IconBook, IconCloud, IconHistory, IconLogout } from './Icons';

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-pop"
      style={{ width: size, height: size }}
    >
      <IconCloud width={size * 0.58} height={size * 0.58} strokeWidth={2.2} />
    </span>
  );
}

export function AppHeader({ minimal = false }: { minimal?: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const nav = [
    { href: '/', label: 'Luyện đề', icon: IconBook },
    { href: '/history', label: 'Lịch sử', icon: IconHistory },
  ];
  async function logout() {
    try {
      await api('/api/auth/logout', {});
    } catch {}
    router.replace('/login');
    router.refresh();
  }
  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <Logo />
          <span className="leading-tight">
            <span className="block text-[15px] font-bold tracking-tight text-stone-900">Cloud Exam Pro</span>
            <span className="block text-[11px] font-medium text-stone-500">AWS SAA-C03 Practice</span>
          </span>
        </Link>
        {!minimal && (
          <nav className="flex items-center gap-1">
            {nav.map((n) => {
              const active = path === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    active ? 'bg-orange-50 text-orange-700' : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <n.icon width={17} height={17} />
                  <span className="hidden sm:inline">{n.label}</span>
                </Link>
              );
            })}
            <button onClick={logout} className="ml-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-stone-500 transition hover:bg-stone-100 hover:text-stone-800" aria-label="Đăng xuất">
              <IconLogout width={17} height={17} />
              <span className="hidden sm:inline">Thoát</span>
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}
