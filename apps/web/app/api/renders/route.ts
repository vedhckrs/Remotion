import { NextRequest, NextResponse } from 'next/server';
import { RenderRequestSchema } from '@nuradi/schemas/index';
import { JobStore, database } from '@nuradi/database/jobs';
import { requireAdmin, body, errorResponse, HttpError } from '../../../lib/access';
import { dispatch } from '@nuradi/shared/transport';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) { try {
    requireAdmin(req);
    const store = new JobStore(database());
    await store.failExpired();
    return NextResponse.json({ jobs: await store.list(), workers: await store.workers(), projects: await store.projects(), analytics: await store.analytics() }, { headers: { 'Cache-Control': 'no-store' } });
}
catch (e) {
    return errorResponse(e);
} }
export async function POST(req: NextRequest) { try {
    requireAdmin(req, true);
    const parsed = RenderRequestSchema.safeParse(await body(req));
    if (!parsed.success)
        throw new HttpError(400, parsed.error.issues.map(i => i.message).join('; '));
    const sha = process.env.NURADI_RELEASE_SHA || process.env.VERCEL_GIT_COMMIT_SHA || '';
    const store = new JobStore(database());
    const job = await store.create(parsed.data, sha);
    try {
        if (process.env.NURADI_QUEUE_ENABLED === 'true') {
            await dispatch(job.id);
            await store.dispatched(job.id);
        }
    }
    catch { /* Durable outbox and claim API retain the job. */ }
    return NextResponse.json({ job }, { status: 202 });
}
catch (e) {
    return errorResponse(e);
} }
