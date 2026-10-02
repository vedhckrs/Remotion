import { QueueClient, PollingQueueClient } from '@vercel/queue';
export const TOPIC = 'nuradi-renders-v1';
export async function dispatch(renderId: string) {
    if (process.env.NURADI_QUEUE_ENABLED !== 'true')
        return;
    const queue = new QueueClient({
        region: process.env.QUEUE_REGION || 'sin1'
    });
    await queue.send(TOPIC, {
        renderId
    });
}
export interface JobTransport {
    nextJob(): Promise<unknown | null>;
    health(): Promise<boolean>;
}
export function queuePoller(claim: (id?: string) => Promise<unknown | null>): JobTransport {
    const queue = new PollingQueueClient({
        region: process.env.QUEUE_REGION || 'sin1'
    });
    return {
        async nextJob() {
            if (process.env.NURADI_QUEUE_ENABLED === 'true') {
                try {
                    let job: unknown | null = null;
                    await queue.receive<{
                        renderId: string;
                    }>(TOPIC, 'nuradi-mac-workers', async (message) => {
                        job = await claim(message.renderId);
                    }, {
                        limit: 1
                    });
                    if (job)
                        return job;
                }
                catch { /* OIDC expiry: DB claim remains authoritative. */
                }
            }
            return claim();
        }, async health() {
            return Boolean(process.env.NURADI_SITE_URL);
        }
    };
}
