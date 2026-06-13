import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  Info,
  Lightbulb,
  ListChecks,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { AskResponse, RetrievalMode } from '../api/types';
import { AnswerText } from '../components/AnswerText';
import { ChunksPanel } from '../components/ChunksPanel';
import { CitationCard } from '../components/CitationCard';
import { ConfidenceMeter } from '../components/ConfidenceMeter';
import { AnswerSkeleton } from '../components/Skeleton';
import { useToast } from '../lib/toast';

const MODES: Array<{ value: RetrievalMode; label: string }> = [
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'dense', label: 'Dense only' },
  { value: 'sparse', label: 'Sparse only' },
];

const SUGGESTIONS = [
  'Why does the Transformer architecture not use recurrence?',
  'What is chain-of-thought prompting and when does it help?',
  'How does RAG combine parametric and non-parametric memory?',
  'What are the two training stages of Constitutional AI?',
  'What BLEU score did the big Transformer achieve on English-to-German?',
  'How many parameters do BERT-Base and BERT-Large have?',
];

const CONTROL_GUIDE: Array<{ term: string; plain: string }> = [
  {
    term: 'Hybrid',
    plain: 'Runs both search styles below at once and merges the results. The safe default — it rarely loses to either one alone.',
  },
  {
    term: 'Dense only',
    plain: 'Searches by meaning, not words. Finds the rollback passage even if you ask “how do I undo a bad release?”.',
  },
  {
    term: 'Sparse only',
    plain: 'Searches by exact words. Unbeatable for precise names and codes like RLAIF, BLEU, or GSM8K that meaning-search blurs.',
  },
  {
    term: 'Dense weight',
    plain: 'The balance knob between the two: 1.0 = all meaning, 0.0 = all keywords. The 0.70 default leans on meaning while still rewarding exact matches.',
  },
  {
    term: 'Verify citations',
    plain: 'A second, independent AI judge re-reads every cited passage and confirms it actually supports the claim. One extra model call, a lot of extra trust.',
  },
];

const SETTINGS_GUIDE: Array<{ scenario: string; setting: string; why: string }> = [
  {
    scenario: 'Everyday questions',
    setting: 'Hybrid · 0.70 · verify ON',
    why: 'The defaults — already tuned for maximum answer quality.',
  },
  {
    scenario: 'Exact names, codes, identifiers',
    setting: 'Hybrid · 0.30–0.50',
    why: 'Gives the keyword matcher more say when wording must match exactly.',
  },
  {
    scenario: 'Paraphrased / conceptual questions',
    setting: 'Hybrid · 0.80–0.90',
    why: 'Leans harder on meaning when your wording differs from the documents.',
  },
  {
    scenario: 'Quick, cheap exploring',
    setting: 'Verify OFF',
    why: 'Skips the verification pass — saves one model call per question.',
  },
];

const READING_GUIDE: Array<{ term: string; plain: string }> = [
  {
    term: '[1] [2] badges',
    plain: 'Every factual claim points at its source passage. Hover a badge to preview exactly what the document says.',
  },
  {
    term: 'Confidence meter',
    plain: 'Green above 75% = strong. Amber 50–75% = decent, skim the citations. Red below 50% = treat with care.',
  },
  {
    term: 'Verified ✓ / Unsupported ✗',
    plain: 'The judge’s verdict on each citation, scored 1–5. An unsupported citation means the answer claimed more than the source says.',
  },
  {
    term: 'Retrieved chunks',
    plain: 'The five passages the answer was built from, with each search engine’s raw score — full transparency into why you got this answer.',
  },
  {
    term: '“I don’t have enough information”',
    plain: 'A feature, not a failure. When the documents can’t ground an answer, Verity refuses instead of inventing one.',
  },
];

function weightHint(weight: number): string {
  if (weight >= 0.8) return 'strongly meaning-leaning — ideal for paraphrased or conceptual questions.';
  if (weight >= 0.55)
    return weight === 0.7
      ? 'the tuned default — the right choice for everyday questions.'
      : 'balanced with a meaning lean — good for everyday questions.';
  if (weight >= 0.35) return 'keyword-leaning — ideal when exact names, codes, or metrics must match.';
  return 'almost all keywords — use only when wording must match the documents exactly.';
}

function GuideCard({
  icon: Icon,
  iconTone,
  title,
  children,
}: {
  icon: typeof BookOpen;
  iconTone: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card card-hover p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconTone}`}>
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export function AskTab({
  draftQuestion,
  onDraftConsumed,
}: {
  draftQuestion?: string;
  onDraftConsumed?: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<RetrievalMode>('hybrid');
  const [denseWeight, setDenseWeight] = useState(0.7);
  const [verifyCitations, setVerifyCitations] = useState(true);
  const [result, setResult] = useState<AskResponse | null>(null);
  const { pushToast } = useToast();
  const statsQuery = useQuery({ queryKey: ['stats'], queryFn: api.stats, staleTime: 30000 });

  useEffect(() => {
    if (draftQuestion) {
      setQuestion(draftQuestion);
      onDraftConsumed?.();
    }
  }, [draftQuestion, onDraftConsumed]);

  const askMutation = useMutation({
    mutationFn: api.ask,
    onSuccess: setResult,
    onError: (error) => pushToast('error', error instanceof ApiError ? error.message : String(error)),
  });

  const submit = (text?: string) => {
    const trimmed = (text ?? question).trim();
    if (trimmed.length < 3 || askMutation.isPending) return;
    askMutation.mutate({
      question: trimmed,
      dense_weight: denseWeight,
      top_k: 5,
      verify_citations: verifyCitations,
      retrieval_mode: mode,
    });
  };

  const verifiedCount = result?.citations.filter((c) => c.verified).length ?? 0;
  const showGuide = !result && !askMutation.isPending;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Main column */}
        <div className="space-y-5">
          <div className="card p-5">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Ask anything about the indexed documents… (Enter to submit)"
              rows={3}
              className="w-full resize-none rounded-xl border border-slate-200 p-3 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <div className="flex rounded-xl border border-slate-200 p-0.5">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setMode(m.value)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      mode === m.value ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {mode === 'hybrid' && (
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  Dense weight
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={denseWeight}
                    onChange={(e) => setDenseWeight(Number(e.target.value))}
                    className="input-range w-32"
                  />
                  <span className="w-8 font-semibold tabular-nums text-slate-700">{denseWeight.toFixed(2)}</span>
                </label>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={verifyCitations}
                onClick={() => setVerifyCitations((v) => !v)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 transition ${
                  verifyCitations
                    ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <span
                  className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${
                    verifyCitations ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                      verifyCitations ? 'left-[18px]' : 'left-0.5'
                    }`}
                  />
                </span>
                <span
                  className={`flex items-center gap-1.5 text-xs font-semibold ${
                    verifyCitations ? 'text-emerald-700' : 'text-slate-500'
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Verify citations
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      verifyCitations ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {verifyCitations ? 'ON' : 'OFF'}
                  </span>
                </span>
              </button>
              <button
                onClick={() => submit()}
                disabled={askMutation.isPending || question.trim().length < 3}
                className="ml-auto flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-700 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
                {askMutation.isPending ? 'Thinking…' : 'Ask'}
              </button>
            </div>

            {mode === 'hybrid' && (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400" />
                <div className="text-[11px] leading-relaxed text-slate-500">
                  <span className="font-semibold text-slate-700">Dense weight</span> balances the two search
                  engines: slide right to trust <em>meaning</em>, left to trust <em>exact words</em>. At{' '}
                  <span className="font-semibold tabular-nums text-indigo-600">{denseWeight.toFixed(2)}</span>{' '}
                  it&apos;s {weightHint(denseWeight)}
                  <span className="mt-1 block text-[10px] text-slate-400">
                    Quick guide: 0.30–0.50 exact names &amp; codes · 0.70 everyday questions (default) ·
                    0.80–0.90 paraphrased questions
                  </span>
                </div>
              </div>
            )}

            {showGuide && (
              <>
                {/* Live execution plan — updates as the controls above change */}
                <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    What happens when you hit Ask — live with your settings
                  </div>
                  <div className="flex flex-wrap items-center gap-y-2">
                    <span className="chip border border-sky-200 bg-sky-50 text-sky-700">
                      Search {statsQuery.data?.total_chunks ?? '…'} passages
                    </span>
                    <ChevronRight className="mx-1 h-3.5 w-3.5 shrink-0 text-slate-300" />
                    {mode === 'hybrid' ? (
                      <span className="chip border border-indigo-200 bg-indigo-50 text-indigo-700">
                        blend {Math.round(denseWeight * 100)}% meaning · {Math.round((1 - denseWeight) * 100)}%
                        keywords
                      </span>
                    ) : mode === 'dense' ? (
                      <span className="chip border border-sky-200 bg-sky-50 text-sky-700">by meaning only</span>
                    ) : (
                      <span className="chip border border-amber-200 bg-amber-50 text-amber-700">
                        by exact keywords only
                      </span>
                    )}
                    <ChevronRight className="mx-1 h-3.5 w-3.5 shrink-0 text-slate-300" />
                    <span className="chip border border-violet-200 bg-violet-50 text-violet-700">
                      AI re-ranks → best 5
                    </span>
                    <ChevronRight className="mx-1 h-3.5 w-3.5 shrink-0 text-slate-300" />
                    <span className="chip border border-emerald-200 bg-emerald-50 text-emerald-700">
                      answer with [N] citations
                    </span>
                    <ChevronRight className="mx-1 h-3.5 w-3.5 shrink-0 text-slate-300" />
                    {verifyCitations ? (
                      <span className="chip border border-emerald-200 bg-emerald-50 text-emerald-700">
                        every citation verified
                      </span>
                    ) : (
                      <span className="chip border border-slate-200 bg-white text-slate-400">
                        verification skipped
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                    Move the dense-weight slider or toggle verification and watch this plan update — it&apos;s
                    exactly what the pipeline will do with your question.
                  </p>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                    <Sparkles className="h-3.5 w-3.5" /> Try one of these
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setQuestion(s)}
                        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {askMutation.isPending && <AnswerSkeleton />}

          {result && !askMutation.isPending && (
            <>
              {result.insufficient_context && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  The system chose not to answer: the retrieved context doesn&apos;t ground this question.
                </div>
              )}
              <div className="card p-6">
                <AnswerText answer={result.answer} citations={result.citations} />
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-400">
                  <span className="chip bg-slate-100 text-slate-500">
                    <Clock className="h-3 w-3" /> {(result.latency_ms / 1000).toFixed(1)}s
                  </span>
                  <span className="chip bg-slate-100 text-slate-500">mode: {result.retrieval_mode_used}</span>
                  {result.citations.length > 0 && (
                    <span className="chip bg-emerald-50 text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> {verifiedCount}/{result.citations.length} citations
                      verified
                    </span>
                  )}
                </div>
              </div>
              {result.citations.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-600">Citations</h3>
                  {result.citations.map((citation) => (
                    <CitationCard key={citation.index} citation={citation} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Insights column */}
        <aside className="space-y-5 xl:sticky xl:top-20">
          {result && !askMutation.isPending ? (
            <>
              <ConfidenceMeter confidence={result.confidence} />
              <ChunksPanel chunks={result.retrieved_chunks} defaultOpen />
            </>
          ) : (
            <div className="card p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">How answers are scored</h3>
              <ul className="space-y-3 text-xs leading-relaxed text-slate-500">
                <li className="flex gap-2.5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-400" />
                  <span>
                    <span className="font-semibold text-slate-700">Retrieval</span> — how closely the found
                    passages match your question&apos;s meaning.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-400" />
                  <span>
                    <span className="font-semibold text-slate-700">Citations</span> — what fraction of the
                    answer&apos;s sources survived independent verification.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                  <span>
                    <span className="font-semibold text-slate-700">Completeness</span> — whether every part of
                    your question was addressed.
                  </span>
                </li>
              </ul>
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
                The composite blends all three (30 / 40 / 30). Green &gt; 75%, amber 50–75%, red below.
              </p>
            </div>
          )}

          <div className="card border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white p-5">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Lightbulb className="h-4 w-4 text-amber-500" /> Pro tip
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              Exact identifiers (<code className="rounded bg-white px-1 text-[11px] text-indigo-600">BLEU</code>,{' '}
              <code className="rounded bg-white px-1 text-[11px] text-indigo-600">RLAIF</code>) favor sparse
              retrieval; paraphrased concepts favor dense. Hybrid catches both — see the difference live in the
              Compare tab.
            </p>
          </div>
        </aside>
      </div>

      {/* New-user field guide — occupies the empty space until the first answer arrives */}
      {showGuide && (
        <div className="grid gap-4 lg:grid-cols-3">
          <GuideCard icon={Settings2} iconTone="bg-sky-50 text-sky-600" title="What the controls mean">
            <dl className="space-y-3">
              {CONTROL_GUIDE.map((item) => (
                <div key={item.term}>
                  <dt className="text-xs font-semibold text-slate-700">{item.term}</dt>
                  <dd className="text-xs leading-relaxed text-slate-500">{item.plain}</dd>
                </div>
              ))}
            </dl>
          </GuideCard>

          <GuideCard icon={ListChecks} iconTone="bg-indigo-50 text-indigo-600" title="Recommended settings">
            <div className="space-y-3">
              {SETTINGS_GUIDE.map((row) => (
                <div key={row.scenario} className="rounded-xl border border-slate-100 p-3">
                  <div className="text-xs font-semibold text-slate-700">{row.scenario}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-indigo-600">{row.setting}</div>
                  <div className="mt-1 text-xs leading-relaxed text-slate-500">{row.why}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-700">
              For maximum answer quality you don&apos;t need to touch anything — Hybrid at 0.70 with
              verification on <em>is</em> the tuned setup.
            </p>
          </GuideCard>

          <GuideCard icon={BookOpen} iconTone="bg-violet-50 text-violet-600" title="How to read your answer">
            <dl className="space-y-3">
              {READING_GUIDE.map((item) => (
                <div key={item.term}>
                  <dt className="text-xs font-semibold text-slate-700">{item.term}</dt>
                  <dd className="text-xs leading-relaxed text-slate-500">{item.plain}</dd>
                </div>
              ))}
            </dl>
          </GuideCard>
        </div>
      )}
    </div>
  );
}
