import { NextRequest, NextResponse } from 'next/server';
import { hasSession, equalSecret } from '../../../web/lib/auth.mjs';
export function authenticated(req: NextRequest) {
    return hasSession({
        headers: {
            cookie: req.headers.get('cookie')
        }
    }, process.env.NURADI_SESSION_SECRET);
}
export function requireAdmin(req: NextRequest, mutation = false) {
    if (!authenticated(req))
        throw new HttpError(401, 'Sign in');
    if (mutation && req.headers.get('origin') !== ((process.env.NURADI_LOCAL_TEST === 'true' && ['127.0.0.1', 'localhost'].includes(req.nextUrl.hostname) ? 'http://' : 'https://') + req.headers.get('host')))
        throw new HttpError(403, 'Invalid origin');
}
export function requireWorker(req: NextRequest) {
    if (!equalSecret(req.headers.get('authorization')?.replace(/^Bearer /, ''), process.env.NURADI_WORKER_TOKEN))
        throw new HttpError(401, 'Unauthorized worker');
}
export class HttpError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}
export function errorResponse(error: unknown) {
    console.error(error instanceof HttpError ? 'Request rejected' : 'Render request failed');
    return NextResponse.json({
        error: error instanceof HttpError ? error.message : 'Request failed; inspect server configuration'
    }, {
        status: error instanceof HttpError ? error.status : 500, headers: {
            'Cache-Control': 'no-store'
        }
    });
}
export async function body(req: NextRequest) {
    const text = await req.text();
    if (Buffer.byteLength(text) > 750000)
        throw new HttpError(413, 'Request too large');
    try {
        return JSON.parse(text);
    }
    catch {
        throw new HttpError(400, 'Invalid JSON');
    }
}
