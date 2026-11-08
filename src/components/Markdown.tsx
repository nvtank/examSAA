'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { highlightMarkdown } from '@/lib/markdown-highlights';

/** Render markdown an toàn (không cho phép HTML thô). Link mở tab mới, không gửi referrer. */
export function Markdown({ children, className = '', highlights = [] }: { children: string; className?: string; highlights?: string[] }) {
  return (
    <div className={`md ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[highlightMarkdown, { terms: highlights }]]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
