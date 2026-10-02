import { NextRequest, NextResponse } from 'next/server';
import { JobStore, database } from '@nuradi/database/jobs';
import { requireAdmin, errorResponse, HttpError } from '../../../../../lib/access';
import { z } from 'zod';
export async function POST(req: NextRequest, { params }: {
    params: Promise<{
        id: string;
    }>;
}) { try {
    requireAdmin(req, true);
    const id = z.string().uuid().parse((await params).id);
    const job = await new JobStore(database()).cancel(id);
    if (!job)
        throw new HttpError(404, 'Render not found');
    return NextResponse.json({ job });
}
catch (e) {
    return errorResponse(e);
} }
