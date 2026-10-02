import fs from 'node:fs';
/** Reject active SVG and external GLB dependencies before Chromium or loaders read untrusted assets. */
export function validateAssetFile(file: string, type: string) {
    if (type === 'svg') {
        const source = fs.readFileSync(file, 'utf8');
        if (/<(?:(?:[\w-]+):)?(?:script|foreignObject|animate|set)\b|<!DOCTYPE|<!ENTITY|\bon\w+\s*=|@import/i.test(source) || [...source.matchAll(/(?:href|src)\s*=\s*["']([^"']*)["']/gi)].some(match => !/^#[a-zA-Z_][\w.-]*$/.test(match[1])) || [...source.matchAll(/url\(\s*["']?([^)'"\s]+)/gi)].some(match => !/^#[a-zA-Z_][\w.-]*$/.test(match[1])))
            throw new Error('SVG contains active or external content');
    }
    if (type === 'glb') {
        const data = fs.readFileSync(file);
        if (data.length < 20 || data.readUInt32LE(0) !== 0x46546c67 || data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length || data.readUInt32LE(16) !== 0x4e4f534a)
            throw new Error('Invalid GLB file');
        const length = data.readUInt32LE(12);
        if (length > 8 * 1024 ** 2 || 20 + length > data.length)
            throw new Error('GLB JSON is too large');
        const json = JSON.parse(data.subarray(20, 20 + length).toString('utf8'));
        for (const item of [...(json.buffers || []), ...(json.images || [])])
            if (item.uri && !/^data:(?:image\/(?:png|jpeg|webp)|application\/octet-stream);base64,/i.test(item.uri))
                throw new Error('GLB references external content');
        for (const accessor of json.accessors || [])
            if (!Number.isSafeInteger(accessor.count) || accessor.count < 0 || accessor.count > 1000000)
                throw new Error('GLB geometry exceeds limits');
    }
}
