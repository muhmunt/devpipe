ALTER TABLE chat_messages DROP COLUMN IF EXISTS doc_id;

ALTER TABLE cards DROP COLUMN IF EXISTS active_plan_id;
ALTER TABLE cards DROP COLUMN IF EXISTS active_prd_id;

ALTER TABLE plans DROP COLUMN IF EXISTS root_id;
ALTER TABLE plans DROP COLUMN IF EXISTS source_plan_id;
ALTER TABLE plans DROP COLUMN IF EXISTS source_card_id;
ALTER TABLE plans DROP COLUMN IF EXISTS title;

ALTER TABLE prds DROP COLUMN IF EXISTS source_prd_id;
ALTER TABLE prds DROP COLUMN IF EXISTS source_card_id;
ALTER TABLE prds DROP COLUMN IF EXISTS title;
DROP INDEX IF EXISTS idx_prds_card_id;
-- Re-adding UNIQUE(card_id) only works if no card has more than one PRD by
-- rollback time; if multi-draft has ever been used in prod this statement
-- fails loudly rather than silently losing data — that's intentional, same
-- convention as 0004_general_chat_stage.down.sql's documented irreversibility.
ALTER TABLE prds ADD CONSTRAINT prds_card_id_key UNIQUE (card_id);
