import type { Scene, Entity } from '@nuradi/schemas/index';
export const clamp = (v: number) => Math.max(0, Math.min(1, v));
export const ease = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
export function stateAt(scene: Scene, entity: Entity, time: number) {
    const state = { x: entity.x, y: entity.y, opacity: 1, scale: 1, rotation: 0, glow: 0, trace: 1, morph: 0, variant: entity.variant || '', value: entity.value || 0 };
    const beats = scene.beats.filter(b => b.target === entity.id).sort((a, b) => a.at - b.at);
    const first = beats.find(b => ['fade', 'slide', 'scale', 'maskReveal', 'draw', 'depthReveal', 'assemble'].includes(b.action));
    if (first && time < first.at)
        state.opacity = 0;
    for (const b of beats) {
        if (time < b.at)
            continue;
        const p = ease((time - b.at) / b.duration), active = time <= b.at + b.duration;
        switch (b.action) {
            case 'fade':
                state.opacity = p;
                break;
            case 'slide':
                state.opacity = p;
                state.y = entity.y + (1 - p) * .08;
                break;
            case 'scale':
            case 'assemble':
            case 'depthReveal':
                state.opacity = p;
                state.scale = .3 + .7 * p;
                break;
            case 'maskReveal':
            case 'draw':
            case 'tracePath':
            case 'connect':
                state.opacity = 1;
                state.trace = p;
                break;
            case 'morph':
                state.morph = p;
                break;
            case 'pulse':
            case 'glow':
            case 'highlight':
                if (active) {
                    state.scale *= 1 + .1 * Math.sin(p * Math.PI);
                    state.glow = Math.sin(p * Math.PI);
                }
                break;
            case 'zoom':
            case 'expand':
                state.scale *= 1 + .35 * p;
                break;
            case 'orbit':
                if (active) {
                    state.x += .02 * Math.cos(p * Math.PI * 2);
                    state.y += .02 * Math.sin(p * Math.PI * 2);
                    state.rotation = p * 360;
                }
                break;
            case 'shake':
                if (active)
                    state.x += .008 * Math.sin(p * Math.PI * 12);
                break;
            case 'followPath':
            case 'flow':
            case 'push':
                if (b.to) {
                    state.x += (b.to.x - state.x) * p;
                    state.y += (b.to.y - state.y) * p;
                }
                break;
            case 'countUp':
                state.value = (entity.value || 0) * p;
                break;
            case 'transform':
                if (p >= .5)
                    state.variant = b.variant || 'active';
                state.glow = active ? Math.sin(p * Math.PI) : 0;
                break;
            case 'split':
                state.scale = 1 - .35 * p;
                state.rotation = 30 * p;
                break;
            case 'merge':
                state.scale = .65 + .35 * p;
                if (b.to) {
                    state.x += (b.to.x - state.x) * p;
                    state.y += (b.to.y - state.y) * p;
                }
                break;
            case 'collapse':
                state.scale = 1 - p;
                state.opacity = 1 - p;
                break;
            case 'wipe':
                state.trace = 1 - p;
                state.opacity = 1 - p;
                break;
            case 'zoomAway':
                state.scale = 1 + 2 * p;
                state.opacity = 1 - p;
                break;
        }
    }
    return state;
}
export function cameraAt(scene: Scene, time: number) { const camera = { x: .5, y: .5, zoom: 1, rotation: 0 }; for (const cue of [...scene.camera].sort((a, b) => a.at - b.at)) {
    if (time < cue.at)
        continue;
    const p = ease((time - cue.at) / cue.duration);
    camera.x += (cue.x - camera.x) * p;
    camera.y += (cue.y - camera.y) * p;
    camera.zoom += (cue.zoom - camera.zoom) * p;
    if (cue.action === 'orbit')
        camera.rotation = 6 * Math.sin(p * Math.PI * 2);
    if (cue.action === 'parallax')
        camera.x += .012 * Math.sin(time * .6);
    if (cue.action === 'whip')
        camera.rotation = 8 * Math.sin(p * Math.PI);
} return camera; }
export function sceneTimeline(scenes: Scene[], fps: number) { let from = 0; return scenes.map(scene => { const duration = Math.max(1, Math.round(scene.duration * fps)); const item = { id: scene.id, from, duration }; from += duration; return item; }); }
export function semanticCues(scene: Scene) { const cues = [...scene.beats]; for (const w of scene.words) {
    const entity = scene.entities.find(e => w.text.toLowerCase().replace(/[^a-z0-9]/g, '') === e.label.toLowerCase());
    if (entity && !cues.some(b => b.target === entity.id && Math.abs(b.at - w.start) < .2))
        cues.push({ at: w.start, duration: .4, action: 'pulse', target: entity.id });
} return cues.sort((a, b) => a.at - b.at); }
