/** Canonical frame arithmetic shared by the browser and production commands. */
export const computeSceneTimings = (scenes, fps, gapSeconds, transitionFrames = 0) => {
  if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(gapSeconds) || gapSeconds < 0) throw new Error('Invalid timeline fps/gap');
  let cursor = 0;
  return scenes.map((scene,i) => {
    if (!Number.isFinite(scene.durationSeconds) || scene.durationSeconds <= 0) throw new Error(`Invalid duration: ${scene.id}`);
    const voiceFrames = Math.ceil(scene.durationSeconds * fps);
    const baseFrames = Math.max(Math.ceil((scene.minSeconds ?? 0)*fps), voiceFrames + Math.ceil(gapSeconds*fps));
    const result = {id:scene.id,startFrame:cursor,baseFrames,voiceFrames,sequenceFrames:baseFrames+(i === scenes.length-1 ? 0 : transitionFrames)};
    cursor += baseFrames; return result;
  });
};
export const totalFrames = (timings) => timings.reduce((sum,t) => sum+t.baseFrames,0);
export const absoluteCaptions = (manifest,timings,fps) => {
  const byId = new Map(timings.map((t) => [t.id,t]));
  return manifest.scenes.flatMap((s) => {
    const t = byId.get(s.id); if (!t) return [];
    const offset = t.startFrame/fps*1000;
    return (s.captions ?? []).map((c) => ({...c,startMs:c.startMs+offset,endMs:c.endMs+offset,timestampMs:c.timestampMs == null ? null : c.timestampMs+offset}));
  }).sort((a,b) => a.startMs-b.startMs);
};
