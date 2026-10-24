export interface TopicTreeNode {
  id: string;
  parentId: string | null;
  slug: string;
  title: string;
  sortOrder: number;
  questionCount: number;
  children: TopicTreeNode[];
}

export interface TagTreeNode {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  sortOrder: number;
  examYear: number | null;
  children: TagTreeNode[];
}

export interface NoteDto {
  id: string;
  topicId: string;
  title: string;
  bodyMd: string;
  sortOrder: number;
}

export interface NoteSummaryDto {
  id: string;
  topicId: string;
  title: string;
  subjectId: string;
}

export interface LinkedQuestionDto {
  id: string;
  type: QuestionType;
  difficulty: number;
}

export interface NoteDetailDto extends NoteDto {
  subjectId: string;
  references: NoteSummaryDto[];
  backlinks: NoteSummaryDto[];
  questions: LinkedQuestionDto[];
}

export interface GraphNodeDto {
  id: string;
  entityId: string;
  kind: 'note' | 'question';
  title: string;
  topicId?: string;
}

export interface GraphEdgeDto {
  id: string;
  source: string;
  target: string;
  kind: 'reference' | 'tests';
}

export interface KnowledgeGraphDto {
  nodes: GraphNodeDto[];
  edges: GraphEdgeDto[];
  subjects: { id: string; title: string }[];
  topics: { id: string; title: string; parentId: string | null }[];
}

export type QuestionType = 'single_choice' | 'multiple_choice' | 'fill_blank' | 'written';
export type SourceKind = 'original' | 'exam' | 'reference';
export type AttemptState = 'revealed_pending_self_eval' | 'evaluated';
export type AttemptResult = 'correct' | 'partial' | 'incorrect';

export interface QuestionSummaryDto {
  id: string;
  type: QuestionType;
  difficulty: number;
  sourceKind: SourceKind;
  examYear: number | null;
  topics: string[];
  tags: string[];
  currentRevision: number;
}

export interface QuestionDetailDto {
  id: string;
  revision: number;
  type: QuestionType;
  difficulty: number;
  stemMd: string;
  options: { key: string; content: string }[] | null;
  userState?: {
    manualReview: boolean;
    starred: boolean;
    lastResult: AttemptResult | null;
  } | null;
}

export interface CreatePracticeSessionRequest {
  questionIds?: string[];
  topicIds?: string[];
  tagIds?: string[];
  difficulties?: number[];
  types?: QuestionType[];
  examYears?: number[];
  statusFilter?: 'all' | 'unattempted' | 'ever_wrong' | 'latest_wrong' | 'review' | 'starred';
  count?: number;
  mode?: 'ordered' | 'random';
  creationKey: string;
}

export interface CreatePracticeSessionResponse {
  sessionId: string | null;
  count: number;
}

export interface PracticeSessionSummaryDto {
  id: string;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  currentOrdinal: number;
  itemCount: number;
  evaluatedCount: number;
  pendingCount: number;
}

export interface PracticeSessionItemSummary {
  ordinal: number;
  questionId: string;
  revision: number;
  attemptState?: AttemptState | 'none';
  attemptResult?: AttemptResult | null;
}

export interface PracticeSessionDetailDto {
  id: string;
  currentOrdinal: number;
  progressVersion: number;
  itemCount: number;
  completed: boolean;
  items: PracticeSessionItemSummary[];
}

export interface SessionItemViewDto {
  ordinal: number;
  totalCount: number;
  sessionId: string;
  question: QuestionDetailDto;
  attempt?: {
    id: string;
    state: AttemptState;
    result: AttemptResult | null;
    evaluationVersion: number;
    selectedAnswerJson?: string | null;
    responseText?: string | null;
  } | null;
  solution?: {
    correctAnswer: unknown;
    explanationMd: string;
  } | null;
}

export interface SubmitAttemptRequest {
  practiceSessionId: string;
  ordinal: number;
  revision: number;
  selectedKeys: string[];
  idempotencyKey: string;
}

export interface SubmitAttemptResponse {
  attemptId: string;
  result: 'correct' | 'incorrect';
  correctAnswer: string | string[];
  explanationMd: string;
}

export interface RevealAttemptRequest {
  practiceSessionId: string;
  ordinal: number;
  revision: number;
  responseText?: string;
  idempotencyKey: string;
}

export interface RevealAttemptResponse {
  attemptId: string;
  state: 'revealed_pending_self_eval';
  correctAnswer: string;
  explanationMd: string;
  evaluationVersion: number;
}

export interface SelfEvaluationRequest {
  result: AttemptResult;
  expectedVersion: number;
}

export interface SelfEvaluationResponse {
  attemptId: string;
  result: AttemptResult;
  evaluationVersion: number;
}

export interface WrongBookItemDto {
  questionId: string;
  revision: number;
  type: QuestionType;
  stemMd: string;
  difficulty: number;
  lastResult: AttemptResult | null;
  wrongCount: number;
  attemptCount: number;
  manualReview: boolean;
  starred: boolean;
  topics: { id: string; title: string }[];
}

export interface StatisticsDto {
  attemptedCount: number;
  latestAccuracy: {
    correct: number;
    total: number;
    rate: number | null;
  };
  historyAccuracy: {
    correct: number;
    total: number;
    rate: number | null;
  };
  pendingSelfEvalCount: number;
  reviewCount: number;
}
