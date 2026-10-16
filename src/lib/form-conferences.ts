import type { Conference } from './conferences';
import type { FormConference } from '@/components/ProposalForm';
import { dateRange, formatDate } from './format';

// The plain data the proposal form needs about each conference.
export const toFormConference = (c: Conference): FormConference => ({
  id: c.id,
  name: c.name,
  details: [dateRange(c.start_date, c.end_date), c.location, c.cfp_closes ? `call closes ${formatDate(c.cfp_closes)}` : ''].filter(Boolean).join(' · '),
  formatList: c.formatList,
  topicList: c.topicList,
  blind_review: c.blind_review,
});
