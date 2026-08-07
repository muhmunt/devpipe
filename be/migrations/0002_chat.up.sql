CREATE TYPE chat_role AS ENUM ('user', 'assistant');

CREATE TABLE chat_messages (
    id         TEXT PRIMARY KEY,
    card_id    TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    stage      stage NOT NULL,
    role       chat_role NOT NULL,
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_card_stage ON chat_messages(card_id, stage);
