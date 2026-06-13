import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ExternalLink,
  FileText,
  FlaskConical,
  GitCompareArrows,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api } from './api/client';
import { AskTab } from './tabs/AskTab';
import { CompareTab } from './tabs/CompareTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { EvalTab } from './tabs/EvalTab';
import { HomeTab } from './tabs/HomeTab';

export type Tab = 'home' | 'ask' | 'documents' | 'eval' | 'compare';

const MAX_DOCS = 8;

const TABS: Array<{
  id: Tab;
  label: string;
  blurb: string;
  description: string;
  gradient: string;
  width: string;
  icon: typeof FileText;
}> = [
  {
    id: 'home',
    label: 'Overview',
    blurb: 'Live insights & system map',
    description: 'Your corpus, your pipeline, and your answer quality — all at a glance.',
    gradient: 'from-indigo-500 to-violet-600',
    width: 'max-w-6xl',
    icon: LayoutDashboard,
  },
  {
    id: 'ask',
    label: 'Ask',
    blurb: 'Cited answers from your corpus',
    description: 'Question in → cited, verified, confidence-scored answer out.',
    gradient: 'from-sky-500 to-indigo-600',
    width: 'max-w-6xl',
    icon: MessageSquareText,
  },
  {
    id: 'documents',
    label: 'Documents',
    blurb: 'Manage the knowledge base',
    description: 'Upload, chunk, and curate the knowledge base every answer is built on.',
    gradient: 'from-sky-500 to-blue-600',
    width: 'max-w-4xl',
    icon: FileText,
  },
  {
    id: 'eval',
    label: 'Eval',
    blurb: 'Automated quality benchmarks',
    description: 'Thirty golden questions, graded by an AI judge — measured quality, not vibes.',
    gradient: 'from-emerald-500 to-teal-600',
    width: 'max-w-6xl',
    icon: FlaskConical,
  },
  {
    id: 'compare',
    label: 'Compare',
    blurb: 'Hybrid vs dense vs sparse',
    description: 'One question, three search engines, side by side — watch hybrid earn its keep.',
    gradient: 'from-violet-500 to-fuchsia-600',
    width: 'max-w-6xl',
    icon: GitCompareArrows,
  },
];

function confidenceColor(value: number): string {
  if (value > 0.75) return 'bg-emerald-400';
  if (value >= 0.5) return 'bg-amber-400';
  return 'bg-red-400';
}

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [draftQuestion, setDraftQuestion] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const statsQuery = useQuery({ queryKey: ['stats'], queryFn: api.stats, refetchInterval: 30000 });
  const evalRunsQuery = useQuery({ queryKey: ['eval-results'], queryFn: api.evalResults, staleTime: 60000 });

  const stats = statsQuery.data;
  const latestEval = evalRunsQuery.data?.at(-1);

  const askFromAnywhere = (question: string) => {
    setDraftQuestion(question);
    setTab('ask');
  };

  const navigate = (next: Tab) => {
    setTab(next);
    setSidebarOpen(false);
  };

  const brand = (
    <div className="flex items-center gap-2.5 px-5 py-6">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-950/50">
        <ShieldCheck className="h-5 w-5 text-white" />
      </div>
      <div>
        <div className="text-lg font-bold tracking-tight text-white">Verity</div>
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
          Document Intelligence
        </div>
      </div>
    </div>
  );

  const nav = (
    <nav className="flex flex-col gap-1 px-3">
      {TABS.map(({ id, label, blurb, icon: Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            onClick={() => navigate(id)}
            className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ${
              active ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <span
              className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-indigo-400 transition-opacity ${
                active ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-indigo-300' : ''}`} />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{label}</span>
              <span className={`block truncate text-[11px] ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                {blurb}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="mt-auto space-y-3 border-t border-white/10 px-5 py-4">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Index health</div>
      {stats ? (
        <>
          <div>
            <div className="mb-1 flex justify-between text-xs text-slate-400">
              <span>Documents</span>
              <span className="tabular-nums text-slate-200">
                {stats.total_documents} / {MAX_DOCS}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-sky-400"
                style={{ width: `${Math.min(100, (stats.total_documents / MAX_DOCS) * 100)}%` }}
              />
            </div>
          </div>
          <div className="flex justify-between text-xs text-slate-400">
            <span>Searchable chunks</span>
            <span className="tabular-nums text-slate-200">{stats.total_chunks}</span>
          </div>
          {stats.avg_confidence_last_50 !== null && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-400">
                <span>Avg confidence</span>
                <span className="tabular-nums text-slate-200">
                  {(stats.avg_confidence_last_50 * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${confidenceColor(stats.avg_confidence_last_50)}`}
                  style={{ width: `${stats.avg_confidence_last_50 * 100}%` }}
                />
              </div>
            </div>
          )}
          {latestEval && (
            <div className="flex justify-between text-xs text-slate-400">
              <span>Last eval pass rate</span>
              <span className="tabular-nums text-slate-200">{(latestEval.pass_rate * 100).toFixed(0)}%</span>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <div className="h-2 w-full animate-pulse rounded bg-white/10" />
          <div className="h-2 w-2/3 animate-pulse rounded bg-white/10" />
        </div>
      )}
    </div>
  );

  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];
  const ActiveIcon = activeTab.icon;

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-navy-950 lg:flex">
        {brand}
        {nav}
        {footer}
      </aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-navy-950">
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
              className="absolute right-4 top-4 text-slate-400"
            >
              <X className="h-5 w-5" />
            </button>
            {brand}
            {nav}
            {footer}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur lg:px-8">
          <button onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="text-slate-500 lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-bold tracking-tight text-indigo-600">Verity</span>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-slate-700">{activeTab.label}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="chip bg-emerald-50 text-emerald-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
            {stats && (
              <span className="chip hidden bg-slate-100 text-slate-500 sm:inline-flex">
                {stats.total_chunks} chunks indexed
              </span>
            )}
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="chip hidden bg-indigo-50 text-indigo-600 transition hover:bg-indigo-100 md:inline-flex"
            >
              API docs <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </header>

        <main key={tab} className="tab-enter flex-1 px-4 py-6 lg:px-8">
          {/* Page header — big, per-tab gradient badge; content below is untouched */}
          <div className={`mx-auto mb-7 ${activeTab.width}`}>
            <div className="flex items-center gap-4">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${activeTab.gradient} shadow-lg shadow-slate-200`}
              >
                <ActiveIcon className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 lg:text-3xl">
                  {activeTab.label}
                </h1>
                <p className="mt-0.5 text-sm text-slate-500 lg:text-base">{activeTab.description}</p>
              </div>
            </div>
          </div>

          {tab === 'home' && <HomeTab onNavigate={navigate} onAsk={askFromAnywhere} />}
          {tab === 'ask' && (
            <AskTab draftQuestion={draftQuestion} onDraftConsumed={() => setDraftQuestion('')} />
          )}
          {tab === 'documents' && <DocumentsTab />}
          {tab === 'eval' && <EvalTab />}
          {tab === 'compare' && <CompareTab />}
        </main>
      </div>
    </div>
  );
}
