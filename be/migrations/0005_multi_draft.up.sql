CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- PRDs: drop the 1-per-card constraint, add title + import provenance
ALTER TABLE prds DROP CONSTRAINT prds_card_id_key;
ALTER TABLE prds ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE prds ADD COLUMN source_card_id TEXT REFERENCES cards(id) ON DELETE SET NULL;
ALTER TABLE prds ADD COLUMN source_prd_id  TEXT REFERENCES prds(id)  ON DELETE SET NULL;
CREATE INDEX idx_prds_card_id ON prds(card_id);

UPDATE prds SET title = 'Draft 1' WHERE title = '';
INSERT INTO prds (id, card_id, title, content)
SELECT gen_random_uuid()::text, c.id, 'Draft 1', ''
FROM cards c WHERE NOT EXISTS (SELECT 1 FROM prds p WHERE p.card_id = c.id);

-- Plans: title + import provenance + stable lineage id
ALTER TABLE plans ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE plans ADD COLUMN source_card_id TEXT REFERENCES cards(id) ON DELETE SET NULL;
ALTER TABLE plans ADD COLUMN source_plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL;
ALTER TABLE plans ADD COLUMN root_id TEXT REFERENCES plans(id) ON DELETE CASCADE;

WITH RECURSIVE chain AS (
  SELECT id, id AS root_id FROM plans WHERE parent_id IS NULL
  UNION ALL
  SELECT p.id, c.root_id FROM plans p JOIN chain c ON p.parent_id = c.id
)
UPDATE plans SET root_id = chain.root_id FROM chain WHERE plans.id = chain.id;
ALTER TABLE plans ALTER COLUMN root_id SET NOT NULL;
CREATE INDEX idx_plans_root_id ON plans(root_id);

UPDATE plans SET title = 'Draft 1' WHERE parent_id IS NULL AND title = '';
UPDATE plans p SET title = r.title FROM plans r WHERE p.root_id = r.id AND p.id <> r.id;

-- Cards: the "what's actually driving this card" pointers
ALTER TABLE cards ADD COLUMN active_prd_id  TEXT REFERENCES prds(id)  ON DELETE SET NULL;
ALTER TABLE cards ADD COLUMN active_plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL;

UPDATE cards c SET active_prd_id = p.id FROM prds p WHERE p.card_id = c.id;
UPDATE cards c SET active_plan_id = root.id
FROM plans root WHERE root.card_id = c.id AND root.parent_id IS NULL;

ALTER TABLE cards ALTER COLUMN active_prd_id SET NOT NULL;

-- Chat: per-draft thread scoping, without touching the stage enum
ALTER TABLE chat_messages ADD COLUMN doc_id TEXT;
CREATE INDEX idx_chat_messages_card_stage_doc ON chat_messages(card_id, stage, doc_id);

UPDATE chat_messages cm SET doc_id = p.id
FROM prds p WHERE cm.card_id = p.card_id AND cm.stage = 'prd';
UPDATE chat_messages cm SET doc_id = root.id
FROM plans root WHERE cm.card_id = root.card_id AND cm.stage = 'plan' AND root.parent_id IS NULL;
