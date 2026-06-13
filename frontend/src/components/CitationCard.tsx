import { CheckCircle2, FileText, XCircle } from 'lucide-react';
import type { Citation } from '../api/types';

export function CitationCard({ citation }: { citation: Citation }) {
  return (
    <div
      className={`card p-4 ${citation.verified ? '' : 'border-red-300 bg-red-50/50'}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-indigo-100 text-xs font-bold text-indigo-700">
            {citation.index}
          </span>
          <FileText className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate text-sm font-semibold text-slate-700">{citation.source_document}</span>
        </div>
        {citation.verified ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Verified {citation.support_score.toFixed(0)}/5
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            <XCircle className="h-3.5 w-3.5" /> Unsupported {citation.support_score.toFixed(0)}/5
          </span>
        )}
      </div>
      {citation.section_heading && (
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{citation.section_heading}</p>
      )}
      <p className="text-sm text-slate-600">{citation.excerpt}…</p>
      {citation.judge_explanation && (
        <p className="mt-2 border-t border-slate-100 pt-2 text-xs italic text-slate-500">
          Judge: {citation.judge_explanation}
        </p>
      )}
    </div>
  );
}
