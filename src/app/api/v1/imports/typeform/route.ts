// POST /api/v1/imports/typeform: n8n's Typeform trigger adds each new response (read-write key).
import { typeformImportRoute } from '@/lib/api-v1';

export const dynamic = 'force-dynamic';
export const { POST, GET, PUT, PATCH, DELETE } = typeformImportRoute();
