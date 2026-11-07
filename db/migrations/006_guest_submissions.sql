-- Guest submissions: proposals from people without an account count only once the emailed
-- confirmation link is used. Until then they are left out of every list, count, export and API response.

ALTER TABLE proposals ADD COLUMN awaiting_confirmation BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX proposals_awaiting_idx ON proposals (submitted_at) WHERE awaiting_confirmation;

ALTER TABLE email_links DROP CONSTRAINT email_links_purpose_check;
ALTER TABLE email_links ADD CONSTRAINT email_links_purpose_check
  CHECK (purpose IN ('password_reset', 'committee_invite', 'confirm_proposal', 'claim_account'));
