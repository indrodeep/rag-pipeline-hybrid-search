import { useRef, useState, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileUp, Info, Loader2, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { ChunkingStrategy } from '../api/types';
import { TableSkeleton } from '../components/Skeleton';
import { useToast } from '../lib/toast';

// Must match max_documents in backend/config.py — the backend enforces it too.
const MAX_DOCS = 8;

const STRATEGIES: Array<{ value: ChunkingStrategy; label: string; plain: string; tag: string }> = [
  {
    value: 'fixed',
    label: 'Fixed',
    plain: 'Cuts the document into equal-size pieces. Fast and predictable, but can split a sentence mid-thought.',
    tag: 'Simple & fast',
  },
  {
    value: 'recursive',
    label: 'Recursive',
    plain: 'Splits along natural breaks — headings, then paragraphs, then sentences. Keeps each piece coherent.',
    tag: 'Recommended',
  },
  {
    value: 'semantic',
    label: 'Semantic',
    plain: 'Starts a fresh piece wherever the topic shifts. Highest-quality boundaries, but slower to upload.',
    tag: 'Highest quality',
  },
];

const GLOSSARY: Array<{ term: string; plain: string }> = [
  {
    term: 'Chunk',
    plain: 'A small passage a document is sliced into. Verity searches chunks, not whole files — so it can pull the one paragraph that answers you.',
  },
  {
    term: 'Token',
    plain: 'How length is measured — roughly ¾ of a word. 512 tokens ≈ 380 words ≈ a few paragraphs.',
  },
  {
    term: 'Chunk size',
    plain: 'How big each piece is. Smaller = more precise matches; larger = more context per piece. 512 is the sweet spot.',
  },
  {
    term: 'Overlap',
    plain: "How much neighbouring chunks share, so an idea split across a boundary isn't lost. About 10–15% of chunk size works well.",
  },
];

export function DocumentsTab() {
  const [strategy, setStrategy] = useState<ChunkingStrategy>('recursive');
  const [chunkSize, setChunkSize] = useState(512);
  const [overlap, setOverlap] = useState(64);
  const [dragging, setDragging] = useState(false);
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const documentsQuery = useQuery({ queryKey: ['documents'], queryFn: api.listDocuments });
  const docCount = documentsQuery.data?.documents.length ?? 0;
  const maxChunks = Math.max(1, ...(documentsQuery.data?.documents.map((d) => d.chunk_count) ?? [1]));

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.ingest(file, strategy, chunkSize, overlap),
    onSuccess: (response) => {
      pushToast(
        'success',
        `${response.filename}: ${response.chunks_created} chunks indexed (${response.chunks_deduplicated} deduplicated) in ${(response.processing_time_ms / 1000).toFixed(1)}s`,
      );
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (error) => {
      // Backend is the authority on the limit — surface its refusal as the popup too.
      if (error instanceof ApiError && error.code === 'document_limit_reached') {
        setLimitModalOpen(true);
        return;
      }
      pushToast('error', error instanceof ApiError ? error.message : String(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteDocument,
    onSuccess: () => {
      pushToast('success', 'Document removed from both indexes');
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (error) => pushToast('error', error instanceof ApiError ? error.message : String(error)),
  });

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (docCount + files.length > MAX_DOCS) {
      setLimitModalOpen(true);
      return;
    }
    Array.from(files).forEach((file) => uploadMutation.mutate(file));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Upload documents</h2>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
              docCount >= MAX_DOCS
                ? 'bg-red-100 text-red-700'
                : docCount >= MAX_DOCS - 1
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-500'
            }`}
          >
            {docCount} / {MAX_DOCS} documents
          </span>
        </div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !uploadMutation.isPending && fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition ${
            dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          {uploadMutation.isPending ? (
            <>
              <Loader2 className="mb-2 h-8 w-8 animate-spin text-indigo-500" />
              <p className="text-sm text-slate-500">Parsing, chunking, embedding, deduplicating…</p>
            </>
          ) : (
            <>
              <FileUp className="mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">Drop files here or click to browse</p>
              <p className="mt-1 text-xs text-slate-400">PDF, .md, .txt, .html — up to 25 MB</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.md,.markdown,.txt,.html,.htm"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {/* Chunking strategy — selectable cards with always-visible descriptions (no hover tooltips) */}
        <div className="mt-5">
          <span className="mb-2 block text-xs font-medium text-slate-500">
            Chunking strategy — how each document is split into searchable pieces
          </span>
          <div className="grid gap-2 sm:grid-cols-3">
            {STRATEGIES.map((s) => {
              const active = strategy === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStrategy(s.value)}
                  className={`rounded-xl border p-3 text-left transition ${
                    active
                      ? 'border-indigo-400 bg-indigo-50/60 ring-1 ring-indigo-200'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-semibold ${active ? 'text-indigo-700' : 'text-slate-700'}`}>
                      {s.label}
                    </span>
                    {active ? (
                      <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                    ) : (
                      <span className="h-4 w-4 rounded-full border-2 border-slate-200" />
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{s.plain}</p>
                  <span
                    className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      active ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {s.tag}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Size + overlap sliders with end-labels */}
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-500">
            Chunk size: <span className="font-semibold text-slate-700">{chunkSize} tokens</span>
            <input
              type="range"
              min={128}
              max={1024}
              step={64}
              value={chunkSize}
              onChange={(e) => setChunkSize(Number(e.target.value))}
              className="input-range mt-2"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-400">
              <span>128 · precise</span>
              <span>1024 · more context</span>
            </div>
          </label>
          <label className="block text-xs font-medium text-slate-500">
            Overlap: <span className="font-semibold text-slate-700">{overlap} tokens</span>
            <input
              type="range"
              min={0}
              max={256}
              step={16}
              value={overlap}
              onChange={(e) => setOverlap(Number(e.target.value))}
              className="input-range mt-2"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-400">
              <span>0 · none</span>
              <span>256 · heavy</span>
            </div>
          </label>
        </div>

        {/* Plain-English glossary for non-technical users */}
        <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
          <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <Info className="h-3.5 w-3.5 text-indigo-400" /> New here? What these terms mean
          </div>
          <dl className="grid gap-x-6 gap-y-2.5 text-[11px] leading-relaxed text-slate-500 sm:grid-cols-2">
            {GLOSSARY.map((g) => (
              <div key={g.term}>
                <dt className="font-semibold text-slate-700">{g.term}</dt>
                <dd>{g.plain}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 rounded-lg bg-emerald-50 p-2.5 text-[11px] leading-relaxed text-emerald-700">
            <span className="font-semibold">For the best results,</span> leave the defaults — Recursive,
            512 size, 64 overlap. They&apos;re already tuned; only change them if you have a specific reason.
          </p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-baseline justify-between p-5 pb-3">
          <h2 className="text-sm font-semibold text-slate-700">Indexed documents</h2>
          {documentsQuery.data && (
            <span className="text-xs text-slate-400">
              {docCount} / {MAX_DOCS} documents · {documentsQuery.data.total_chunks} chunks total
            </span>
          )}
        </div>
        {documentsQuery.isLoading ? (
          <div className="p-5 pt-0">
            <TableSkeleton />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2 font-medium">Filename</th>
                <th className="px-3 py-2 font-medium">Chunks</th>
                <th className="px-3 py-2 font-medium">Strategy</th>
                <th className="px-3 py-2 font-medium">Uploaded</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(documentsQuery.data?.documents ?? []).map((doc) => (
                <tr key={doc.document_id} className="border-b border-slate-50">
                  <td className="px-5 py-2.5 font-medium text-slate-700">{doc.filename}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-8 tabular-nums text-slate-500">{doc.chunk_count}</span>
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-indigo-400"
                          style={{ width: `${(doc.chunk_count / maxChunks) * 100}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      {doc.chunking_strategy}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">
                    {new Date(doc.uploaded_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => deleteMutation.mutate(doc.document_id)}
                      disabled={deleteMutation.isPending}
                      aria-label={`Delete ${doc.filename}`}
                      className="rounded p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {documentsQuery.data?.documents.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-400">
                    No documents indexed yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {limitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setLimitModalOpen(false)} />
          <div role="alertdialog" className="card relative w-full max-w-md p-6">
            <button
              onClick={() => setLimitModalOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 text-slate-300 transition hover:text-slate-500"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <h3 className="mb-1 text-base font-semibold text-slate-800">Document limit reached</h3>
            <p className="mb-4 text-sm text-slate-500">
              The index holds at most {MAX_DOCS} documents at a time ({docCount} / {MAX_DOCS} used).
              Remove a document from the list below before adding a new one.
            </p>
            <button
              onClick={() => setLimitModalOpen(false)}
              className="w-full rounded-lg bg-slate-800 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
