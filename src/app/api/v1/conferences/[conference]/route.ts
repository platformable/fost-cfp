// GET /api/v1/conferences/{id or slug}
import { v1, getConference } from '@/lib/api-v1';

export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, PATCH, DELETE } = v1(getConference);
