export const parseRange = (header,size) => {
  if (!Number.isSafeInteger(size) || size <= 0) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!m || (!m[1] && !m[2])) return null;
  let start,end;
  if (!m[1]) { const length=Number(m[2]); if (!Number.isSafeInteger(length) || length <= 0) return null; start=Math.max(0,size-length);end=size-1; }
  else {start=Number(m[1]);end=m[2] ? Math.min(Number(m[2]),size-1) : size-1;}
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start < size && end >= start ? {start,end} : null;
};
