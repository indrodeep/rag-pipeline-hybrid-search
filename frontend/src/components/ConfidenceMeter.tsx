import type { ConfidenceBreakdown } from '../api/types';

function barColor(value: number): string {
  if (value > 0.75) return 'bg-emerald-500';
  if (value >= 0.5) return 'bg-amber-500';
  return 'bg-red-500';
}

function MiniBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1">
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-medium tabular-nums">{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${barColor(value)}`} style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

export function ConfidenceMeter({ confidence }: { confidence: ConfidenceBreakdown }) {
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-slate-700">Composite confidence</span>
        <span className="text-lg font-bold tabular-nums">{(confidence.composite * 100).toFixed(0)}%</span>
      </div>
      <div className="mb-4 h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor(confidence.composite)}`}
          style={{ width: `${confidence.composite * 100}%` }}
        />
      </div>
      <div className="flex gap-4">
        <MiniBar label="Retrieval" value={confidence.retrieval} />
        <MiniBar label="Citations" value={confidence.citation_coverage} />
        <MiniBar label="Completeness" value={confidence.completeness} />
      </div>
    </div>
  );
}
