-- Conferences can be dated to the month only ("June 2027") until exact days are known.
-- A month-only conference stores the first of the month in start_date and has no end_date.

ALTER TABLE conferences
  ADD COLUMN date_precision TEXT NOT NULL DEFAULT 'day'
    CONSTRAINT conferences_date_precision_check CHECK (date_precision IN ('day', 'month'));

ALTER TABLE conferences
  ADD CONSTRAINT conferences_month_only_shape_check CHECK (
    date_precision = 'day'
    OR (start_date IS NOT NULL AND EXTRACT(DAY FROM start_date) = 1 AND end_date IS NULL)
  );
