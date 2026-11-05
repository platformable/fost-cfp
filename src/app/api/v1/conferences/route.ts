// GET /api/v1/conferences: every conference, 100 per page.
import { v1, listConferences } from '@/lib/api-v1';

export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, PATCH, DELETE } = v1(listConferences);
