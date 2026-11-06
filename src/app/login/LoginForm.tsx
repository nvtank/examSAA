'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Logo } from '@/components/AppHeader';
import { IconLock, IconShield, IconTarget, IconClock } from '@/components/Icons';

export function LoginForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      await api('/api/auth/login', { code });
      router.replace('/');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Không đăng nhập được');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-5xl items-center gap-10 px-5 py-10 lg:grid-cols-2">
      <section className="rise">
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <div>
            <p className="text-lg font-bold tracking-tight">Cloud Exam Pro</p>
            <p className="text-xs font-medium text-stone-500">AWS Certified Solutions Architect — Associate</p>
          </div>
        </div>
        <h1 className="mt-8 text-4xl font-extrabold leading-[1.1] tracking-tight text-stone-900 sm:text-5xl">
          Luyện đề SAA-C03
          <span className="block text-orange-500">như thi thật.</span>
        </h1>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-stone-600">
          Hơn 990 câu hỏi từ Cloud Mentor, Tutorials Dojo và Udemy. Chọn chế độ luyện tập để xem đáp án ngay, hoặc thi thử
          160 phút và chấm điểm theo chuẩn đạt 72%.
        </p>
        <ul className="mt-7 grid gap-3 text-sm text-stone-700">
          {[
            [IconTarget, 'Luyện tập — hiện đáp án & giải thích ngay sau mỗi câu'],
            [IconClock, 'Thi thử — đếm ngược 160 phút, nộp bài mới có kết quả'],
            [IconShield, 'Kho đề mã hóa, chỉ phục vụ qua API có kiểm soát'],
          ].map(([Ic, t], i) => {
            const I = Ic as typeof IconTarget;
            return (
              <li key={i} className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                  <I width={17} height={17} />
                </span>
                {t as string}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card rise p-7 sm:p-9" style={{ animationDelay: '80ms' }}>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
          <IconLock />
        </div>
        <h2 className="mt-5 text-xl font-bold tracking-tight">Nhập mã truy cập</h2>
        <p className="mt-1 text-sm text-stone-500">Trang này là riêng tư. Chỉ người có mã mới vào được kho đề.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="code" className="label">
              Mã truy cập
            </label>
            <input
              id="code"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-stone-300 bg-white px-4 text-base outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
              placeholder="••••••••••••"
            />
          </div>
          {err && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {err}
            </p>
          )}
          <button className="btn-primary h-12 w-full text-base" disabled={busy || !code.trim()}>
            {busy ? 'Đang kiểm tra…' : 'Vào luyện đề'}
          </button>
        </form>
      </section>
    </main>
  );
}
