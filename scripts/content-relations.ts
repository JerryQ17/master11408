// A complete, replaceable projection of frontmatter. Execute after all entities
// exist, in the same batch; removed links cannot survive a successful sync.
export function buildRelationStatements(
  notes: { id: string; references: string[] }[],
  questions: { id: string; notes: string[] }[],
): { sql: string; params: string[] }[] {
  return [
    { sql: 'DELETE FROM question_notes', params: [] },
    { sql: 'DELETE FROM note_references', params: [] },
    ...notes.flatMap((note) =>
      note.references.map((id) => ({
        sql: 'INSERT INTO note_references (source_note_id, target_note_id) VALUES (?, ?)',
        params: [note.id, id],
      })),
    ),
    ...questions.flatMap((question) =>
      question.notes.map((id) => ({
        sql: 'INSERT INTO question_notes (question_id, note_id) VALUES (?, ?)',
        params: [question.id, id],
      })),
    ),
  ];
}
