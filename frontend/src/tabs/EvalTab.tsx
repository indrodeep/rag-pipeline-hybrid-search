import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FlaskConical, XCircle } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, ApiError } from '../api/client';
import type { AnswerType, EvalReport } from '../api/types';
import { TableSkeleton } from '../components/Skeleton';
import { useToast } from '../lib/toast';

const CATEGORY_META: Array<{ type: AnswerType; label: string; bar: string }> = [
  { type: 'lookup', label: 'Direct lookups', bar: 'bg-sky-500' },
  { type: 'multi_hop', label: 'Multi-hop reasoning', bar: 'bg-indigo-500' },
  { type: 'unanswerable', label: 'Hallucination traps', bar: 'bg-emerald-500' },
  { type: 'ambiguous', label: 'Ambiguous edge cases', bar: 'bg-amber-500' },
];

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card card-hover flex-1 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-slate-800">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function BoolIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
  ) : (
    <XCircle className="mx-auto h-4 w-4 text-red-400" />
  );
}

function CategoryBreakdown({ report }: { report: EvalReport }) {
  return (
    <div className="card card-hover p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">Pass rate by category</h3>
      <div className="space-y-3">
        {CATEGORY_META.map(({ type, label, bar }) => {
          const cases = report.results.filter((r) => r.answer_type === type);
          if (cases.length === 0) return null;
          const passed = cases.filter((r) => r.passed).length;
          const pct = (passed / cases.length) * 100;
          return (
            <div key={type}>
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>{label}</span>
                <span className="tabular-nums">
                  {passed}/{cases.length} · {pct.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
        Ambiguous questions are the hardest category by design — they reward enumerating every valid
        interpretation instead of picking one.
      </p>
    </div>
  );
}

export function EvalTab() {
  const [freshReport, setFreshReport] = useState<EvalReport | null>(null);
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const runMutation = useMutation({
    mutationFn: api.runEval,
    onSuccess: (result) => {
      setFreshReport(result);
      pushToast('success', `Eval run ${result.run_id} finished: ${(result.pass_rate * 100).toFixed(0)}% pass rate`);
      void queryClient.invalidateQueries({ queryKey: ['eval-results'] });
    },
    onError: (error) => pushToast('error', error instanceof ApiError ? error.message : String(error)),
  });

  const progressQuery = useQuery({
    queryKey: ['eval-progress'],
    queryFn: api.evalProgress,
    refetchInterval: runMutation.isPending ? 1000 : false,
    enabled: runMutation.isPending,
  });

  const resultsQuery = useQuery({ queryKey: ['eval-results'], queryFn: api.evalResults });
  const latestSummary = resultsQuery.data?.at(-1);

  // Show the freshest run available: just-finished run, else the persisted latest.
  const latestDetailQuery = useQuery({
    queryKey: ['eval-detail', latestSummary?.run_id],
    queryFn: () => api.evalResultDetail(latestSummary!.run_id),
    enabled: !!latestSummary && !freshReport,
  });
  const report = freshReport ?? latestDetailQuery.data ?? null;

  const progress = progressQuery.data;
  const trend = (resultsQuery.data ?? []).map((run, i) => ({
    run: `#${i + 1}`,
    passRate: Math.round(run.pass_rate * 100),
    correctness: run.avg_correctness,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="card flex flex-wrap items-center gap-4 p-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-700">Golden Q&A eval suite</h2>
          <p className="text-xs text-slate-400">
            30 cases against the AI-papers corpus: 10 lookups, 8 multi-hop, 6 unanswerable, 6 ambiguous.
            Each answer is graded by LLM-as-judge — a full run makes ~120 model calls.
          </p>
        </div>
        <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-700 disabled:opacity-40"
        >
          <FlaskConical className="h-4 w-4" />
          {runMutation.isPending ? 'Running…' : 'Run eval suite'}
        </button>
      </div>

      {runMutation.isPending && (
        <div className="card p-5">
          <div className="mb-2 flex justify-between text-xs text-slate-500">
            <span>Evaluating against current index…</span>
            <span className="tabular-nums">
              {progress?.completed ?? 0} / {progress?.total ?? 30}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-700"
              style={{ width: `${progress && progress.total > 0 ? (progress.completed / progress.total) * 100 : 3}%` }}
            />
          </div>
        </div>
      )}

      {report && (
        <>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {freshReport ? 'Fresh run' : 'Latest persisted run'} · {report.run_id} ·{' '}
            {new Date(report.started_at).toLocaleString()}
          </div>
          <div className="flex flex-wrap gap-4">
            <SummaryCard label="Pass rate" value={`${(report.pass_rate * 100).toFixed(0)}%`} sub={`${report.total_cases} cases`} />
            <SummaryCard label="Avg correctness" value={`${report.avg_correctness.toFixed(1)}/5`} sub="LLM-as-judge" />
            <SummaryCard label='"I don’t know" accuracy' value={`${(report.idk_accuracy * 100).toFixed(0)}%`} sub="hallucination traps refused" />
            <SummaryCard label="Avg latency" value={`${(report.avg_latency_ms / 1000).toFixed(1)}s`} sub="per question" />
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
            <CategoryBreakdown report={report} />
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5 font-medium">Question</th>
                    <th className="px-2 py-2.5 font-medium">Type</th>
                    <th className="px-2 py-2.5 text-center font-medium">Score</th>
                    <th className="px-2 py-2.5 text-center font-medium">Retrieved</th>
                    <th className="px-2 py-2.5 text-center font-medium">Citations</th>
                    <th className="px-2 py-2.5 text-center font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {report.results.map((r) => (
                    <tr key={r.case_id} className="border-b border-slate-50 transition hover:bg-slate-50/60">
                      <td className="max-w-xs px-4 py-2 text-slate-700" title={r.answer}>
                        <span className="line-clamp-2">{r.question}</span>
                      </td>
                      <td className="px-2 py-2">
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{r.answer_type}</span>
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums text-slate-600">
                        {r.answer_correctness.toFixed(0)}/5
                      </td>
                      <td className="px-2 py-2"><BoolIcon ok={r.retrieved_relevant} /></td>
                      <td className="px-2 py-2"><BoolIcon ok={r.citation_accurate} /></td>
                      <td className="px-2 py-2 text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            r.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {r.passed ? 'PASS' : 'FAIL'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="card p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Score trend across runs</h3>
        {resultsQuery.isLoading ? (
          <TableSkeleton rows={3} />
        ) : trend.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No eval runs yet — run the suite to start a trend line.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="run" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
              <YAxis yAxisId="right" orientation="right" domain={[1, 5]} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line yAxisId="left" type="monotone" dataKey="passRate" name="Pass rate (%)" stroke="#4f46e5" strokeWidth={2} />
              <Line yAxisId="right" type="monotone" dataKey="correctness" name="Avg correctness (1-5)" stroke="#10b981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
