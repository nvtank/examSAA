'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from './Icons';

type Popup = { text: string; terms: string[]; left: number; top: number };

export function SelectionHighlighter({ children, onAdd, onRemove }: {
  children: ReactNode;
  onAdd: (text: string) => void;
  onRemove: (terms: string[]) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const pointerDown = useRef(false);
  const [popup, setPopup] = useState<Popup | null>(null);

  const position = (rect: DOMRect) => ({
    left: Math.max(8, Math.min(rect.left + rect.width / 2 - 90, window.innerWidth - 188)),
    top: Math.max(8, Math.min(rect.top >= 56 ? rect.top - 48 : rect.bottom + 8, window.innerHeight - 52)),
  });

  useEffect(() => {
    const updateSelection = () => {
      if (pointerDown.current) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !root.current?.contains(selection.anchorNode) || !root.current.contains(selection.focusNode)) {
        setPopup((current) => current?.terms.length ? current : null);
        return;
      }
      const start = selection.anchorNode?.parentElement?.closest('.md');
      const end = selection.focusNode?.parentElement?.closest('.md');
      const text = selection.toString().trim();
      if (!start || start !== end || !text || text.length > 500) { setPopup(null); return; }
      setPopup({ text, terms: [], ...position(selection.getRangeAt(0).getBoundingClientRect()) });
    };
    const down = (event: PointerEvent) => {
      if (popupRef.current?.contains(event.target as Node)) return;
      pointerDown.current = true;
      setPopup(null);
    };
    const up = (event: PointerEvent) => {
      pointerDown.current = false;
      if (!popupRef.current?.contains(event.target as Node)) updateSelection();
    };
    const dismiss = () => setPopup(null);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    document.addEventListener('selectionchange', updateSelection);
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', up);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('selectionchange', updateSelection);
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, []);

  return (
    <div ref={root} onClickCapture={(event) => {
      const mark = (event.target as HTMLElement).closest<HTMLElement>('mark.keyword-highlight');
      if (!mark || !window.getSelection()?.isCollapsed) return;
      event.stopPropagation();
      const terms: string[] = JSON.parse(mark.dataset.highlightTerms ?? '[]');
      if (terms.length) setPopup({ text: '', terms, ...position(mark.getBoundingClientRect()) });
    }}>
      {children}
      {popup && createPortal(
        <div ref={popupRef} role="toolbar" aria-label="Tùy chọn tô sáng"
          className="fixed z-50 flex items-center gap-1 rounded-xl border border-stone-200 bg-white p-1 shadow-lg"
          style={{ left: popup.left, top: popup.top }} onPointerDown={(event) => event.preventDefault()}>
          <button type="button" className="rounded-lg px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50"
            onClick={() => {
              if (popup.terms.length) onRemove(popup.terms);
              else onAdd(popup.text);
              window.getSelection()?.removeAllRanges();
              setPopup(null);
            }}>
            {popup.terms.length ? 'Bỏ tô sáng' : 'Tô sáng'}
          </button>
          <button type="button" aria-label="Đóng popup tô sáng" className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" onClick={() => setPopup(null)}>
            <IconX width={16} height={16} />
          </button>
        </div>, document.body,
      )}
    </div>
  );
}
