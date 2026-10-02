import { spawn } from 'node:child_process';
export async function mediaCommand(command: string, args: string[], signal?: AbortSignal) {
    signal?.throwIfAborted();
    return new Promise<{
        stdout: Buffer;
        stderr: string;
        code: number | null;
    }>((resolve, reject) => {
        const child = spawn(command, args, {
            signal
        });
        const chunks: Buffer[] = [];
        let length = 0, stderr = '';
        child.stdout.on('data', (chunk: Buffer) => {
            length += chunk.length;
            if (length > 4 * 1024 ** 2) {
                child.kill();
                reject(new Error('Media inspection exceeded its output bound'));
            }
            else
                chunks.push(chunk);
        });
        child.stderr.on('data', chunk => {
            stderr = (stderr + chunk.toString()).slice(-100000);
        });
        child.on('error', reject);
        child.on('close', code => resolve({
            stdout: Buffer.concat(chunks), stderr, code
        }));
    });
}
