import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { RetrievedChunk } from '../api/types';

function Score({ label, value, digits = 3 }: { label: string; value: number | null; digits?: number }) {
  return (
    <div className="rounded bg-slate-50 px-2 py-1 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-xs font-semibold tabular-nums text-slate-700">
        {value === null ? '—' : value.toFixed(digits)}
      </div>
    </div>
  );
}

export function ChunksPanel({ chunks, defaultOpen = false }: { chunks: RetrievedChunk[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 p-4 text-left text-sm font-semibold text-slate-700"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Retrieved chunks ({chunks.length})
        <span className="ml-auto text-xs font-normal text-slate-400">cosine · BM25 · RRF · rerank</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 p-4">
          {chunks.map((chunk) => (
            <div key={chunk.chunk_id} className="rounded-lg border border-slate-100 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  #{chunk.final_rank}
                </span>
                <span className="text-xs font-semibold text-slate-600">{chunk.source_document}</span>
                {chunk.section_heading && <span className="text-xs text-slate-400">· {chunk.section_heading}</span>}
                <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                  {chunk.chunking_strategy}
                </span>
              </div>
              <div className="mb-2 grid grid-cols-4 gap-2">
                <Score label="Cosine" value={chunk.dense_score} />
                <Score label="BM25" value={chunk.sparse_score} digits={2} />
                <Score label="RRF" value={chunk.rrf_score} digits={4} />
                <Score label="Rerank" value={chunk.rerank_score} digits={0} />
              </div>
              <p className="line-clamp-3 text-xs text-slate-500">{chunk.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
