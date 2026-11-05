// GET /api/v1/proposals?conference=&status=&updated_since=&cursor=
import { v1, listProposals } from '@/lib/api-v1';

export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, PATCH, DELETE } = v1(listProposals);
