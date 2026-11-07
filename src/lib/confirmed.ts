// Guest proposals awaiting email confirmation must not appear anywhere: committee lists, counts,
// exports, the API or speakers' own lists. Every query that reads proposals adds this condition.
export const CONFIRMED = (alias = 'p') => `NOT ${alias}.awaiting_confirmation`;
