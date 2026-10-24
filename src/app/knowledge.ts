import type { CreatePracticeSessionResponse } from '../../shared/types';

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message || '请求失败，请稍后重试');
  }
  return response.json();
}

export async function createQuestionPractice(questionId: string): Promise<string> {
  const result = await fetchJson<CreatePracticeSessionResponse>('/api/v1/practice-sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionIds: [questionId], count: 1, creationKey: crypto.randomUUID() }),
  });
  if (!result.sessionId) throw new Error('当前习题不可用');
  return result.sessionId;
}
