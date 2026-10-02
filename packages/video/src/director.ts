import { SceneSpecSchema, type SceneSpec, type Scene } from '@nuradi/schemas/index';
const families = [['MAP', /\b(world|countries|india|geograph|location)\b/i], ['NETWORK', /\b(network|connect|internet|routing)\b/i], ['PROCESS', /\b(request|then|before|gateway|process|authenticate)\b/i], ['COMPARISON', /\b(versus|compared|difference|instead)\b/i], ['DATA', /\b(percent|growth|chart|statistics)\b/i], ['TIMELINE', /\b(year|history|timeline)\b/i], ['THREE_D', /\b(3d|three-dimensional)\b/i]] as const;
export function classify(text: string): Scene['type'] {
    return families.find(([, re]) => re.test(text))?.[0] || 'EXPLAIN';
}
/** Deterministic fallback director. External AI may propose JSON, never executable source. */
export function direct(script: string): SceneSpec {
    const sentences = script.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean).flatMap(sentence => {
        const words = sentence.match(/\S+\s*/g) || [];
        const parts: string[] = [];
        for (let start = 0; start < words.length; start += 70)
            parts.push(words.slice(start, start + 70).join('').trim());
        return parts;
    });
    if (sentences.length > 300)
        throw new Error('Script exceeds 300 scenes; split it into episodes');
    if (!sentences.length)
        throw new Error('Enter a script');
    return SceneSpecSchema.parse({
        schemaVersion: 1, title: sentences[0].slice(0, 120), scenes: sentences.map((text, i) => {
            let type = classify(text);
            const percentages = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)).map((match, index) => ({
                label: `Value ${index + 1} (${match[1]}%)`, value: Number(match[1])
            }));
            const geo = /\bindia\b/i.test(text) ? [{
                    id: 'india', label: 'India', longitude: 78, latitude: 22
                }] : [];
            if (type === 'MAP' && !geo.length)
                type = 'EXPLAIN';
            if (type === 'DATA' && !percentages.length)
                type = 'EXPLAIN';
            const names = type === 'PROCESS' ? ['Client', 'Gateway', 'Service'] : type === 'NETWORK' ? ['Source', 'Router', 'Destination'] : type === 'COMPARISON' ? ['Before', 'After'] : ['Concept', 'Detail', 'Result'];
            const entities = names.map((label, n) => ({
                id: 'object' + n, label, kind: n === 1 ? 'shield' : 'server', x: .2 + n * .3, y: .55
            }));
            const duration = Math.max(4, Math.min(30, text.split(/\s+/).length / 2.5 + 1));
            return {
                id: 'scene' + i, type, data: type === 'DATA' ? percentages : [], geo: type === 'MAP' ? geo : [], visualIntent: text.slice(0, 500), headline: text.slice(0, 120), narration: text, duration, entities, relationships: entities.slice(1).map((e, n) => ({
                    id: 'link' + n, from: entities[n].id, to: e.id
                })), transformation: type === 'PROCESS' ? 'unverified to authenticated' : undefined, beats: entities.flatMap((e, n) => [{
                        at: n * .35, duration: .6, action: 'assemble', target: e.id
                    }, {
                        at: Math.min(duration - .5, 1 + n * .7), duration: .4, action: 'pulse', target: e.id
                    }]), camera: [{
                        at: 1, duration: Math.max(1, duration - 1), action: 'push', x: .5, y: .55, zoom: 1.08
                    }]
            };
        })
    });
}
export function validateDirectorOutput(value: unknown) {
    return SceneSpecSchema.parse(value);
}
