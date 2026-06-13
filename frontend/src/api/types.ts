// Mirrors the backend Pydantic models (backend/models/*.py).

export type RetrievalMode = 'hybrid' | 'dense' | 'sparse';
export type ChunkingStrategy = 'fixed' | 'recursive' | 'semantic';
export type AnswerType = 'lookup' | 'multi_hop' | 'unanswerable' | 'ambiguous';

export interface AskRequest {
  question: string;
  dense_weight: number;
  top_k: number;
  verify_citations: boolean;
  retrieval_mode: RetrievalMode;
}

export interface RetrievedChunk {
  chunk_id: string;
  text: string;
  source_document: string;
  section_heading: string;
  chunking_strategy: string;
  dense_score: number | null;
  sparse_score: number | null;
  rrf_score: number | null;
  rerank_score: number | null;
  final_rank: number;
}

export interface Citation {
  index: number;
  chunk_id: string;
  source_document: string;
  section_heading: string;
  excerpt: string;
  support_score: number;
  verified: boolean;
  claim_text: string;
  judge_explanation: string;
}

export interface ConfidenceBreakdown {
  retrieval: number;
  citation_coverage: number;
  completeness: number;
  composite: number;
}

export interface AskResponse {
  answer: string;
  citations: Citation[];
  confidence: ConfidenceBreakdown;
  retrieved_chunks: RetrievedChunk[];
  retrieval_mode_used: RetrievalMode;
  latency_ms: number;
  insufficient_context: boolean;
}

export interface IngestResponse {
  document_id: string;
  filename: string;
  chunks_created: number;
  chunks_deduplicated: number;
  chunking_strategy: ChunkingStrategy;
  processing_time_ms: number;
}

export interface DocumentMeta {
  document_id: string;
  filename: string;
  file_type: string;
  chunk_count: number;
  chunking_strategy: ChunkingStrategy;
  chunk_size: number;
  overlap: number;
  uploaded_at: string;
}

export interface DocumentListResponse {
  documents: DocumentMeta[];
  total_chunks: number;
}

export interface EvalCaseResult {
  case_id: string;
  question: string;
  answer_type: AnswerType;
  answer: string;
  answer_correctness: number;
  retrieved_relevant: boolean;
  citation_accurate: boolean;
  said_i_dont_know: boolean;
  passed: boolean;
  latency_ms: number;
  composite_confidence: number;
}

export interface EvalReport {
  run_id: string;
  started_at: string;
  finished_at: string;
  total_cases: number;
  pass_rate: number;
  avg_correctness: number;
  idk_accuracy: number;
  avg_latency_ms: number;
  results: EvalCaseResult[];
}

export interface EvalRunSummary {
  run_id: string;
  started_at: string;
  pass_rate: number;
  avg_correctness: number;
  idk_accuracy: number;
  avg_latency_ms: number;
  total_cases: number;
}

export interface EvalProgress {
  running: boolean;
  completed: number;
  total: number;
}

export interface StatsResponse {
  total_documents: number;
  total_chunks: number;
  avg_confidence_last_50: number | null;
  retrieval_mode_distribution: Record<string, number>;
  top_questions_by_confidence: Array<Record<string, string | number>>;
}
