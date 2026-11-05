// GET /api/v1/conferences/{id or slug}/committee: program committee names and emails.
import { v1, getCommittee } from '@/lib/api-v1';

export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, PATCH, DELETE } = v1(getCommittee);
