import { NextRequest } from 'next/server';
import { issueSignedToken, presignUrl } from '@vercel/blob';
import { JobStore, database } from '@nuradi/database/jobs';
import { requireAdmin, errorResponse, HttpError } from '../../../../../lib/access';
import { z } from 'zod';
export async function GET(req: NextRequest, { params }: {
    params: Promise<{
        id: string;
    }>;
}) { try {
    requireAdmin(req);
    const id = z.string().uuid().parse((await params).id);
    const job = await new JobStore(database()).get(id);
    const kind = req.nextUrl.searchParams.get('kind') || 'video';
    const asset = job?.artifacts.find(a => a.kind === kind);
    if (!asset || job?.status !== 'COMPLETED')
        throw new HttpError(404, 'Artifact unavailable');
    const validUntil = Date.now() + 15 * 60 * 1000;
    const token = await issueSignedToken({ pathname: asset.pathname, operations: ['get'], validUntil });
    const { presignedUrl } = await presignUrl(token, { pathname: asset.pathname, operation: 'get', access: 'private', validUntil });
    return Response.redirect(presignedUrl, 307);
}
catch (e) {
    return errorResponse(e);
} }
