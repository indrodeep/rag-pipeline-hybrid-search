import type {
  AskRequest,
  AskResponse,
  ChunkingStrategy,
  DocumentListResponse,
  EvalProgress,
  EvalReport,
  EvalRunSummary,
  IngestResponse,
  StatsResponse,
} from './types';

const API_BASE: string = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(0, 'network_error', `Cannot reach the backend at ${API_BASE}. Is uvicorn running?`);
  }
  if (!response.ok) {
    let code = 'http_error';
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string; message?: string; detail?: unknown };
      code = body.error ?? code;
      message = body.message ?? (typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail ?? message));
    } catch {
      // non-JSON error body; keep defaults
    }
    throw new ApiError(response.status, code, message);
  }
  return (await response.json()) as T;
}

export const api = {
  ask: (body: AskRequest): Promise<AskResponse> =>
    request('/v1/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  ingest: (file: File, strategy: ChunkingStrategy, chunkSize: number, overlap: number): Promise<IngestResponse> => {
    const form = new FormData();
    form.append('file', file);
    form.append('chunking_strategy', strategy);
    form.append('chunk_size', String(chunkSize));
    form.append('overlap', String(overlap));
    return request('/v1/ingest', { method: 'POST', body: form });
  },

  listDocuments: (): Promise<DocumentListResponse> => request('/v1/documents'),

  deleteDocument: (documentId: string): Promise<{ status: string }> =>
    request(`/v1/documents/${documentId}`, { method: 'DELETE' }),

  stats: (): Promise<StatsResponse> => request('/v1/stats'),

  runEval: (): Promise<EvalReport> => request('/v1/eval/run', { method: 'POST' }),

  evalProgress: (): Promise<EvalProgress> => request('/v1/eval/progress'),

  evalResults: (): Promise<EvalRunSummary[]> => request('/v1/eval/results'),

  evalResultDetail: (runId: string): Promise<EvalReport> => request(`/v1/eval/results/${runId}`),
};
