import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateContent } from '../scripts/content-validator.ts';

async function fixture(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'knowledge-content-'));
  try {
    await mkdir(join(dir, 'notes'));
    await mkdir(join(dir, 'questions'));
    await writeFile(join(dir, 'topics.yaml'), '- id: subject\n  title: 科目\n');
    await writeFile(join(dir, 'tags.yaml'), '- id: sample\n  name: 样例\n');
    await writeFile(join(dir, 'notes/a.md'), note('a', 'references: [b]'));
    await writeFile(join(dir, 'notes/b.md'), note('b', 'references: [a]'));
    await writeFile(join(dir, 'questions/q.md'), question('notes: [a, b]'));
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
function note(id: string, field = '') {
  return `---\nid: ${id}\ntopic: subject\ntitle: 笔记${id}\n${field}\n---\n正文\n`;
}
function question(field = '') {
  return `---\nid: q\ntype: single_choice\nsource_kind: original\ntopics: [subject]\ntags: [sample]\noptions:\n  - key: A\n    content: 甲\n  - key: B\n    content: 乙\nanswer: A\n${field}\n---\n## 题目\n题干\n## 解析\n解析\n`;
}

test('accepts many-to-many links, mutual citations and omitted optional fields', () =>
  fixture(async (dir) => {
    const result = await validateContent(dir);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.questions[0]?.notes, ['a', 'b']);
    await writeFile(join(dir, 'notes/a.md'), note('a'));
    await writeFile(join(dir, 'questions/q.md'), question());
    const optional = await validateContent(dir);
    assert.equal(optional.valid, true);
    assert.deepEqual(optional.questions[0]?.notes, []);
    assert.deepEqual(optional.notes.find((n) => n.id === 'a')?.references, []);
  }));

test('rejects unknown, duplicate, malformed and self-referential links', () =>
  fixture(async (dir) => {
    for (const field of [
      'references: a',
      'references: [a]',
      'references: [b, b]',
      'references: [missing]',
      'references: [null]',
    ]) {
      await writeFile(join(dir, 'notes/a.md'), note('a', field));
      assert.equal((await validateContent(dir)).valid, false, field);
    }
    await writeFile(join(dir, 'notes/a.md'), note('a'));
    for (const field of ['notes: a', 'notes: [a, a]', 'notes: [missing]', 'notes: [123]']) {
      await writeFile(join(dir, 'questions/q.md'), question(field));
      assert.equal((await validateContent(dir)).valid, false, field);
    }
  }));

test('relationship-only edits change the corresponding content hashes', () =>
  fixture(async (dir) => {
    const original = await validateContent(dir);
    await writeFile(join(dir, 'notes/a.md'), note('a'));
    await writeFile(join(dir, 'questions/q.md'), question('notes: [b]'));
    const changed = await validateContent(dir);
    assert.notEqual(
      original.notes.find((n) => n.id === 'a')?.contentHash,
      changed.notes.find((n) => n.id === 'a')?.contentHash,
    );
    assert.notEqual(original.questions[0]?.contentHash, changed.questions[0]?.contentHash);
  }));
