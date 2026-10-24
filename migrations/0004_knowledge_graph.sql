CREATE TABLE question_notes (
  question_id TEXT NOT NULL REFERENCES questions(id),
  note_id TEXT NOT NULL REFERENCES notes(id),
  PRIMARY KEY (question_id, note_id)
);
CREATE INDEX question_notes_by_note ON question_notes(note_id, question_id);

CREATE TABLE note_references (
  source_note_id TEXT NOT NULL REFERENCES notes(id),
  target_note_id TEXT NOT NULL REFERENCES notes(id),
  PRIMARY KEY (source_note_id, target_note_id),
  CHECK (source_note_id <> target_note_id)
);
CREATE INDEX note_references_by_target ON note_references(target_note_id, source_note_id);
