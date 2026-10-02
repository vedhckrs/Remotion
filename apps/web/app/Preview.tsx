'use client';
import { useEffect, useState } from 'react';
import { Player } from '@remotion/player';
import { SemanticExplainer } from '@nuradi/video/Composition';
import type { SceneSpec } from '@nuradi/schemas/index';
export default function Preview({ spec, projectId }: {
    spec: SceneSpec;
    projectId: string;
}) {
    const vertical = spec.ratio === '9:16';
    const [assetUrls, setAssetUrls] = useState<Record<string, string>>({}), [error, setError] = useState('');
    const assets = JSON.stringify(spec.assets);
    useEffect(() => { let active = true; async function load() { try {
        const pairs = await Promise.all(spec.assets.map(async (asset) => { const response = await fetch(`/api/assets?projectId=${encodeURIComponent(projectId)}&sha256=${asset.sha256}`); const data = await response.json(); if (!response.ok)
            throw new Error(data.error || 'Preview asset unavailable'); return [asset.path, data.url] as const; }));
        if (active) {
            setAssetUrls(Object.fromEntries(pairs));
            setError('');
        }
    }
    catch (e) {
        if (active)
            setError(e instanceof Error ? e.message : 'Preview unavailable');
    } } void load(); const timer = setInterval(() => void load(), 10 * 60 * 1000); return () => { active = false; clearInterval(timer); }; }, [assets, projectId]);
    if (error)
        return <p role="alert">{error}</p>;
    if (spec.assets.some(asset => !assetUrls[asset.path]))
        return <p>Loading private preview assets…</p>;
    return <Player component={SemanticExplainer} inputProps={{ spec, assetUrls }} durationInFrames={spec.scenes.reduce((n, s) => n + Math.round(s.duration * 30), 0)} compositionWidth={vertical ? 1080 : 1920} compositionHeight={vertical ? 1920 : 1080} fps={30} controls style={{ width: '100%', maxHeight: 550, aspectRatio: vertical ? '9/16' : '16/9' }}/>;
}
