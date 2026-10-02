import { NextRequest } from 'next/server';
import handler from '../../../../../api/control.mjs';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) { let status = 200; const headers = new Headers(); const response = { setHeader: (k: string, v: string) => headers.set(k, v), status: (value: number) => { status = value; return response; }, json: (data: unknown) => new Response(JSON.stringify(data), { status, headers }) }; headers.set('Content-Type', 'application/json'); const incoming = Object.fromEntries(req.headers); if (process.env.NURADI_LOCAL_TEST === 'true' && ['127.0.0.1', 'localhost'].includes(req.nextUrl.hostname) && incoming.origin === 'http://' + incoming.host)
    incoming.origin = 'https://' + incoming.host; return handler({ method: 'POST', headers: incoming, body: await req.text() }, response); }
