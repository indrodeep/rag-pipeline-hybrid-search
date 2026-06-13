import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ChevronRight,
  Database,
  FileText,
  FlaskConical,
  Gauge,
  GitCompareArrows,
  MessageSquareText,
  TrendingUp,
  Upload,
} from 'lucide-react';
import { api } from '../api/client';
import type { Tab } from '../App';

const PIPELINE_STAGES: Array<{ label: string; classes: string }> = [
  { label: 'Hybrid retrieval', classes: 'bg-sky-50 text-sky-700 border-sky-200' },
  { label: 'RRF fusion', classes: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { label: 'LLM rerank', classes: 'bg-violet-50 text-violet-700 border-violet-200' },
  { label: 'Grounded generation', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { label: 'Citation verification', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  { label: 'Confidence scoring', classes: 'bg-rose-50 text-rose-700 border-rose-200' },
];

const MODE_STYLES: Record<string, { label: string; bar: string }> = {
  hybrid: { label: 'Hybrid (RRF)', bar: 'bg-indigo-500' },
  dense: { label: 'Dense only', bar: 'bg-sky-500' },
  sparse: { label: 'Sparse (BM25)', bar: 'bg-amber-500' },
};

function confidenceTone(value: number): string {
  if (value > 0.75) return 'bg-emerald-100 text-emerald-700';
  if (value >= 0.5) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className="card card-hover flex items-start gap-3 p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
        <div className="text-2xl font-bold tabular-nums leading-tight text-slate-800">{value}</div>
        <div className="truncate text-xs text-slate-400">{sub}</div>
      </div>
    </div>
  );
}

export function HomeTab({ onNavigate, onAsk }: { onNavigate: (tab: Tab) => void; onAsk: (q: string) => void }) {
  const statsQuery = useQuery({ queryKey: ['stats'], queryFn: api.stats, refetchInterval: 30000 });
  const evalRunsQuery = useQuery({ queryKey: ['eval-results'], queryFn: api.evalResults, staleTime: 60000 });

  const stats = statsQuery.data;
  const latestEval = evalRunsQuery.data?.at(-1);

  const totalQueries = stats
    ? Object.values(stats.retrieval_mode_distribution).reduce((sum, n) => sum + n, 0)
    : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Hero */}
      <div className="card relative overflow-hidden p-8 lg:p-12">
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-indigo-100/80 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-40 h-72 w-72 rounded-full bg-violet-100/70 blur-3xl" />
        <div className="relative">
          <span className="chip mb-4 border border-indigo-100 bg-indigo-50 text-indigo-600">
            Retrieval-augmented generation · Hybrid search · LLM-as-judge
          </span>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 lg:text-5xl">
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-500 bg-clip-text text-transparent">
              Verity
            </span>
          </h1>
          <p className="mt-3 max-w-xl text-lg font-medium text-slate-700">
            Ask your documents anything. Get answers with receipts.
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            Every answer is retrieved with hybrid dense + sparse search, generated strictly from your
            corpus, cited inline, independently verified by an LLM judge, and shipped with a composite
            confidence score. When the documents don&apos;t know — Verity says so instead of guessing.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => onNavigate('ask')}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700"
            >
              <MessageSquareText className="h-4 w-4" /> Ask a question <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => onNavigate('documents')}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" /> Upload documents
            </button>
            <button
              onClick={() => onNavigate('compare')}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50"
            >
              <GitCompareArrows className="h-4 w-4" /> Compare retrieval modes
            </button>
          </div>

          {/* Pipeline map */}
          <div className="mt-8 flex flex-wrap items-center gap-y-2">
            {PIPELINE_STAGES.map((stage, i) => (
              <span key={stage.label} className="flex items-center">
                <span className={`chip border ${stage.classes}`}>{stage.label}</span>
                {i < PIPELINE_STAGES.length - 1 && (
                  <ChevronRight className="mx-1 h-3.5 w-3.5 text-slate-300" />
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Live stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={FileText}
          label="Documents"
          value={stats ? String(stats.total_documents) : '—'}
          sub="indexed in the corpus"
          tone="bg-sky-50 text-sky-600"
        />
        <StatCard
          icon={Database}
          label="Chunks"
          value={stats ? String(stats.total_chunks) : '—'}
          sub="searchable passages"
          tone="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          icon={Gauge}
          label="Avg confidence"
          value={
            stats?.avg_confidence_last_50 != null
              ? `${(stats.avg_confidence_last_50 * 100).toFixed(0)}%`
              : '—'
          }
          sub="rolling window of recent queries"
          tone="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          icon={FlaskConical}
          label="Eval pass rate"
          value={latestEval ? `${(latestEval.pass_rate * 100).toFixed(0)}%` : '—'}
          sub={latestEval ? `correctness ${latestEval.avg_correctness}/5 · IDK ${(latestEval.idk_accuracy * 100).toFixed(0)}%` : 'no runs yet'}
          tone="bg-violet-50 text-violet-600"
        />
      </div>

      {/* Insight panels */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card card-hover p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-slate-700">Highest-confidence answers</h3>
            <span className="ml-auto text-xs text-slate-400">click to re-ask</span>
          </div>
          {stats && stats.top_questions_by_confidence.length > 0 ? (
            <ul className="space-y-2">
              {stats.top_questions_by_confidence.map((entry, i) => {
                const question = String(entry.question);
                const confidence = Number(entry.confidence);
                return (
                  <li key={i}>
                    <button
                      onClick={() => onAsk(question)}
                      className="group flex w-full items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 text-left transition hover:border-indigo-200 hover:bg-indigo-50/40"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-600 group-hover:text-slate-800">
                        {question}
                      </span>
                      <span className={`chip shrink-0 tabular-nums ${confidenceTone(confidence)}`}>
                        {(confidence * 100).toFixed(0)}%
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-400" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">
              Ask a few questions and the strongest answers will surface here.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="card card-hover p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Retrieval mode usage</h3>
            {stats && totalQueries > 0 ? (
              <div className="space-y-3">
                {Object.entries(MODE_STYLES).map(([mode, style]) => {
                  const count = stats.retrieval_mode_distribution[mode] ?? 0;
                  const pct = totalQueries ? (count / totalQueries) * 100 : 0;
                  return (
                    <div key={mode}>
                      <div className="mb-1 flex justify-between text-xs text-slate-500">
                        <span>{style.label}</span>
                        <span className="tabular-nums">
                          {count} · {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-4 text-center text-xs text-slate-400">No queries yet.</p>
            )}
          </div>

          <div className="card card-hover p-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Latest benchmark</h3>
            {latestEval ? (
              <>
                <div className="mb-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums text-slate-800">
                    {(latestEval.pass_rate * 100).toFixed(0)}%
                  </span>
                  <span className="text-xs text-slate-400">
                    pass · {latestEval.total_cases} golden questions
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <span>Answer correctness</span>
                    <span className="tabular-nums text-slate-700">{latestEval.avg_correctness} / 5</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Hallucination refusal</span>
                    <span className="tabular-nums text-slate-700">
                      {(latestEval.idk_accuracy * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg latency</span>
                    <span className="tabular-nums text-slate-700">
                      {(latestEval.avg_latency_ms / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onNavigate('eval')}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                >
                  Open benchmark detail <ArrowRight className="h-3 w-3" />
                </button>
              </>
            ) : (
              <p className="py-4 text-center text-xs text-slate-400">
                Run the eval suite to benchmark answer quality.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
