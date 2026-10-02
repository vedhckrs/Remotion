export const visibilityAt = (beats, frame, id, fallback = 4) => {
  let at = beats.some((b) => b.show?.includes(id)) ? Infinity : fallback;
  let visible = frame >= at;
  for (const b of [...beats].sort((a,b) => a.frame-b.frame)) {
    if (b.frame > frame) break;
    if (b.show?.includes(id)) { at = b.frame; visible = true; }
    if (b.hide?.includes(id)) visible = false;
  }
  return {visible, since: visible ? frame-at : -1};
};
