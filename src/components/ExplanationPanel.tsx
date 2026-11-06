'use client';
import type { Explanation } from '@/lib/types';
import { Markdown } from './Markdown';

function Section({ title, children, open = true, tone = 'default' }: { title: string; children: string; open?: boolean; tone?: 'default' | 'warn' | 'tip' }) {
  if (!children.trim()) return null;
  const tones = {
    default: 'border-stone-200 bg-white',
    warn: 'border-stone-200 bg-white',
    tip: 'border-orange-200 bg-orange-50/60',
  };
  return (
    <details open={open} className={`group rounded-xl border ${tones[tone]} open:shadow-sm`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-stone-800 marker:hidden [&::-webkit-details-marker]:hidden">
        {title}
        <span className="text-stone-400 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-stone-100 px-4 py-3">
        <Markdown>{children}</Markdown>
      </div>
    </details>
  );
}

export function ExplanationPanel({ expl, ok }: { expl: Explanation; ok: boolean }) {
  return (
    <div className="rise mt-6 space-y-3">
      <div
        className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold ${
          ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}
        role="status"
      >
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-white ${ok ? 'bg-green-500' : 'bg-red-500'}`}>
          {ok ? '✓' : '✕'}
        </span>
        {ok ? 'Chính xác!' : 'Chưa đúng — xem lời giải bên dưới'}
      </div>
      {expl.topic && (
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-orange-700">Chủ đề · {expl.topic}</p>
      )}
      <Section title="Vì sao đáp án này đúng?">{expl.why}</Section>
      <Section title="Vì sao các phương án khác sai?">{expl.distractors}</Section>
      <Section title="Mẹo thi & trọng tâm ghi nhớ" tone="tip">{expl.tips}</Section>
      <Section title="Tài liệu tham khảo" open={false}>{expl.refs}</Section>
    </div>
  );
}
