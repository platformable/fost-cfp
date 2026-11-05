// Any other /api/v1/ address: a JSON 404 (after the usual key check).
import { v1, unknownPath } from '@/lib/api-v1';

export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, PATCH, DELETE } = v1(unknownPath);
