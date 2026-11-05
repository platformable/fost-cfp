// GET /api/v1/speakers/{id}
import { v1, getSpeaker } from '@/lib/api-v1';

export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, PATCH, DELETE } = v1(getSpeaker);
