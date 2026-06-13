import { useState } from 'react';
import type { Citation } from '../api/types';

/**
 * Renders answer text with [N] citation markers replaced by hoverable badges
 * that pop the cited chunk's excerpt.
 */
export function AnswerText({ answer, citations }: { answer: string; citations: Citation[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const byIndex = new Map(citations.map((c) => [c.index, c]));
  const parts = answer.split(/(\[\d+\])/g);

  return (
    <p className="leading-relaxed text-slate-800">
      {parts.map((part, i) => {
        const match = /^\[(\d+)\]$/.exec(part);
        if (!match) return <span key={i}>{part}</span>;
        const index = Number(match[1]);
        const citation = byIndex.get(index);
        return (
          <span key={i} className="relative inline-block">
            <button
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              className={`mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded px-1 align-text-top text-xs font-semibold ${
                citation?.verified === false
                  ? 'bg-red-100 text-red-700'
                  : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
              }`}
            >
              {index}
            </button>
            {hovered === index && citation && (
              <span className="absolute bottom-full left-1/2 z-20 mb-2 block w-72 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-xl">
                <span className="mb-1 block font-semibold text-slate-700">
                  {citation.source_document}
                  {citation.section_heading ? ` — ${citation.section_heading}` : ''}
                </span>
                <span className="block text-slate-600">{citation.excerpt}…</span>
              </span>
            )}
          </span>
        );
      })}
    </p>
  );
}
