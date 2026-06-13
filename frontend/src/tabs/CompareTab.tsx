import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { GitCompareArrows, Send } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { AskResponse, RetrievalMode } from '../api/types';
import { useToast } from '../lib/toast';

const MODES: RetrievalMode[] = ['hybrid', 'dense', 'sparse'];

const MODE_STYLE: Record<
  RetrievalMode,
  { label: string; accent: string; chip: string; tagline: string; plain: string; bestFor: string }
> = {
  hybrid: {
    label: 'Hybrid (RRF)',
    accent: 'border-t-indigo-500',
    chip: 'bg-indigo-100 text-indigo-700',
    tagline: 'Both engines, one ballot',
    plain:
      'Runs the meaning search and the keyword search at the same time, then merges the two ranked lists with Reciprocal Rank Fusion — a passage that scores well in either list rises to the top.',
    bestFor: 'Everyday questions. The default for a reason — it rarely loses to either engine alone.',
  },
  dense: {
    label: 'Dense only',
    accent: 'border-t-sky-500',
    chip: 'bg-sky-100 text-sky-700',
    tagline: 'The meaning matcher',
    plain:
      'Turns your question into a vector that captures its meaning, then finds passages about the same idea — even when they share zero words with your question.',
    bestFor: 'Paraphrases and conceptual questions, where your wording differs from the documents.',
  },
  sparse: {
    label: 'Sparse only (BM25)',
    accent: 'border-t-amber-500',
    chip: 'bg-amber-100 text-amber-700',
    tagline: 'The keyword matcher',
    plain:
      'Classic search-engine scoring: ranks passages by exact word overlap, with rare words counting most. No AI involved in the matching at all.',
    bestFor: 'Precise names, metrics, and codes — BLEU, RLAIF, GSM8K — that meaning-search blurs together.',
  },
};

// One keyword-shaped and one paraphrase-shaped question, chosen to make the engines visibly disagree.
const CONTRAST_EXAMPLES = [
  {
    label: 'Keyword-style',
    question: 'What BLEU score did the big Transformer achieve on English-to-German?',
    hint: 'exact metric name → watch sparse shine',
  },
  {
    label: 'Paraphrase-style',
    question: 'How can a language model be taught to explain its thinking step by step?',
    hint: 'no shared keywords → watch dense shine',
  },
];

type CompareResults = Partial<Record<RetrievalMode, AskResponse>>;

/** chunk_id -> number of modes that retrieved it (1-3) */
function overlapMap(results: CompareResults): Map<string, number> {
  const counts = new Map<string, number>();
  for (const mode of MODES) {
    for (const chunk of results[mode]?.retrieved_chunks ?? []) {
      counts.set(chunk.chunk_id, (counts.get(chunk.chunk_id) ?? 0) + 1);
    }
  }
  return counts;
}

function OverlapBadge({ count }: { count: number }) {
  if (count === 3)
    return <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">ALL 3</span>;
  if (count === 2)
    return <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">2 OF 3</span>;
  return <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">UNIQUE</span>;
}

export function CompareTab() {
  const [question, setQuestion] = useState('');
  const [results, setResults] = useState<CompareResults>({});
  const { pushToast } = useToast();

  const compareMutation = useMutation({
    mutationFn: async (q: string): Promise<CompareResults> => {
      const settled = await Promise.allSettled(
        MODES.map((mode) =>
          api.ask({ question: q, dense_weight: 0.7, top_k: 5, verify_citations: true, retrieval_mode: mode }),
        ),
      );
      const next: CompareResults = {};
      settled.forEach((outcome, i) => {
        if (outcome.status === 'fulfilled') {
          next[MODES[i]] = outcome.value;
        } else {
          const reason = outcome.reason;
          pushToast('error', `${MODES[i]}: ${reason instanceof ApiError ? reason.message : String(reason)}`);
        }
      });
      return next;
    },
    onSuccess: setResults,
  });

  const submit = (text?: string) => {
    const trimmed = (text ?? question).trim();
    if (trimmed.length < 3 || compareMutation.isPending) return;
    compareMutation.mutate(trimmed);
  };

  const overlaps = overlapMap(results);
  const hasResults = MODES.some((mode) => results[mode]);
  const showIntro = !hasResults && !compareMutation.isPending;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Question bar */}
      <div className="card p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <GitCompareArrows className="h-4 w-4 text-indigo-500" />
          One question, three search engines, side by side
        </div>
        <p className="mb-3 text-xs text-slate-400">
          The same question runs through all three retrieval modes in parallel — same documents, same
          generator, different evidence. The differences you see are purely how the context was found.
        </p>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Ask a question to compare modes…"
            className="flex-1 rounded-xl border border-slate-200 p-3 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <button
            onClick={() => submit()}
            disabled={compareMutation.isPending || question.trim().length < 3}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-700 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
            {compareMutation.isPending ? 'Comparing…' : 'Compare'}
          </button>
        </div>
        {showIntro && (
          <div className="mt-3 flex flex-wrap gap-2">
            {CONTRAST_EXAMPLES.map((ex) => (
              <button
                key={ex.question}
                onClick={() => setQuestion(ex.question)}
                className="group rounded-xl border border-slate-200 px-3 py-2 text-left transition hover:border-indigo-300 hover:bg-indigo-50/50"
              >
                <span className="block text-[10px] font-bold uppercase tracking-wide text-indigo-500">
                  {ex.label}
                </span>
                <span className="block text-xs text-slate-600 group-hover:text-slate-800">{ex.question}</span>
                <span className="block text-[10px] text-slate-400">{ex.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pre-run: the three columns become mode explainers, so no space sits empty */}
      {showIntro && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            {MODES.map((mode) => {
              const style = MODE_STYLE[mode];
              return (
                <div key={mode} className={`card card-hover border-t-4 ${style.accent} p-5`}>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.chip}`}>
                    {style.label}
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-slate-700">{style.tagline}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{style.plain}</p>
                  <div className="mt-3 rounded-xl bg-slate-50 p-3">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Best for</span>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{style.bestFor}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:divide-x sm:divide-slate-100">
              <div className="flex items-start gap-2.5 sm:flex-1 sm:pr-4">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600">
                  1
                </span>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  <span className="font-semibold text-slate-700">Pick a question.</span> Use an example above
                  or your own — one comparison costs three questions&apos; worth of API.
                </p>
              </div>
              <div className="flex items-start gap-2.5 sm:flex-1 sm:px-4">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-600">
                  2
                </span>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  <span className="font-semibold text-slate-700">Compare the evidence.</span> Badges show who
                  found each passage — <span className="font-semibold text-emerald-600">ALL 3</span>,{' '}
                  <span className="font-semibold text-amber-600">2 OF 3</span>, or{' '}
                  <span className="font-semibold text-slate-500">UNIQUE</span>. Unique finds are where engines
                  differ.
                </p>
              </div>
              <div className="flex items-start gap-2.5 sm:flex-1 sm:pl-4">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-600">
                  3
                </span>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  <span className="font-semibold text-slate-700">Compare the answers.</span> Same generator,
                  different evidence — higher confidence means better grounding. Hybrid usually wins.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Post-run: overlap legend */}
      {hasResults && !compareMutation.isPending && (
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><OverlapBadge count={3} /> retrieved by all modes</span>
          <span className="flex items-center gap-1.5"><OverlapBadge count={2} /> by two modes</span>
          <span className="flex items-center gap-1.5"><OverlapBadge count={1} /> by one mode only</span>
        </div>
      )}

      {/* Results / loading columns */}
      {(hasResults || compareMutation.isPending) && (
        <div className="grid gap-4 lg:grid-cols-3">
          {MODES.map((mode) => {
            const style = MODE_STYLE[mode];
            const result = results[mode];
            return (
              <div key={mode} className={`card border-t-4 ${style.accent} flex flex-col`}>
                <div className="flex items-center justify-between border-b border-slate-100 p-4">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.chip}`}>{style.label}</span>
                  {result && !compareMutation.isPending && (
                    <span className="text-xs tabular-nums text-slate-400">{(result.latency_ms / 1000).toFixed(1)}s</span>
                  )}
                </div>

                {compareMutation.isPending ? (
                  <div className="space-y-3 p-4">
                    <div className="skeleton h-3 w-full" />
                    <div className="skeleton h-3 w-5/6" />
                    <div className="skeleton h-3 w-2/3" />
                    <div className="skeleton h-16 w-full" />
                    <div className="skeleton h-16 w-full" />
                  </div>
                ) : result ? (
                  <div className="flex flex-1 flex-col p-4">
                    <p className="mb-3 text-sm leading-relaxed text-slate-700">{result.answer}</p>
                    <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">
                      Confidence
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full ${
                            result.confidence.composite > 0.75
                              ? 'bg-emerald-500'
                              : result.confidence.composite >= 0.5
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                          }`}
                          style={{ width: `${result.confidence.composite * 100}%` }}
                        />
                      </div>
                      <span className="font-semibold tabular-nums text-slate-600">
                        {(result.confidence.composite * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-auto space-y-2">
                      {result.retrieved_chunks.map((chunk) => {
                        const count = overlaps.get(chunk.chunk_id) ?? 1;
                        return (
                          <div
                            key={chunk.chunk_id}
                            className={`rounded-xl border p-2 ${
                              count === 3
                                ? 'border-emerald-200 bg-emerald-50/50'
                                : count === 2
                                  ? 'border-amber-200 bg-amber-50/50'
                                  : 'border-slate-200'
                            }`}
                          >
                            <div className="mb-1 flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-slate-400">#{chunk.final_rank}</span>
                              <span className="truncate text-xs font-medium text-slate-600">{chunk.source_document}</span>
                              <span className="ml-auto"><OverlapBadge count={count} /></span>
                            </div>
                            <p className="line-clamp-2 text-[11px] text-slate-500">{chunk.text}</p>
                            <div className="mt-1 flex gap-2 text-[10px] tabular-nums text-slate-400">
                              {chunk.dense_score !== null && <span>cos {chunk.dense_score.toFixed(3)}</span>}
                              {chunk.sparse_score !== null && <span>bm25 {chunk.sparse_score.toFixed(2)}</span>}
                              {chunk.rrf_score !== null && <span>rrf {chunk.rrf_score.toFixed(4)}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-1 items-center justify-center p-8 text-xs text-slate-300">
                    No result for this mode
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
