// GET /api/v1/proposals/{id}
import { v1, getProposal } from '@/lib/api-v1';

export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, PATCH, DELETE } = v1(getProposal);
