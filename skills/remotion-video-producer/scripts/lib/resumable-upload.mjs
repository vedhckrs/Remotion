import fs from 'node:fs';
/** Persist every acknowledged offset and the remote id before later metadata work. */
export const resumableUpload = async ({file, headers, state, save, fetchImpl = fetch, wait = (ms) => new Promise((r) => setTimeout(r,ms))}) => {
  if (state.video) return state.video;
  const size = fs.statSync(file).size;
  const probe = () => fetchImpl(state.session, {method:'PUT',headers:{...headers,'Content-Length':'0','Content-Range':`bytes */${size}`}});
  const accept = async (res) => {
    if (res.ok) { const video = await res.json(); if (!video.id) throw new Error('Upload response has no video id'); state.video=video;save();return video; }
    if (res.status === 308) {
      const range = res.headers.get('Range');
      const match = range && /^bytes=0-(\d+)$/.exec(range);
      const next = match ? Number(match[1])+1 : 0;
      if (!Number.isSafeInteger(next) || next < 0 || next > size) throw new Error('Invalid upload acknowledgment');
      state.offset=next;save();return null;
    }
    throw new Error(`Upload status HTTP ${res.status}`);
  };
  const fd = fs.openSync(file,'r');
  try {
    const done = await accept(await probe()); if (done) return done;
    let failures=0;
    while ((state.offset ?? 0) < size) {
      const offset=state.offset ?? 0, len=Math.min(32*1024*1024,size-offset),buf=Buffer.alloc(len);
      fs.readSync(fd,buf,0,len,offset);
      try {
        const res=await fetchImpl(state.session,{method:'PUT',headers:{...headers,'Content-Length':String(len),'Content-Range':`bytes ${offset}-${offset+len-1}/${size}`},body:buf});
        const video=await accept(res);if(video)return video;
        if(state.offset <= offset) throw new Error('Upload made no acknowledged progress');
        failures=0;
      } catch (error) {
        if (++failures >= 4) throw error;
        await wait(1000*2**failures);
        const video=await accept(await probe());if(video)return video;
      }
    }
    const video=await accept(await probe());if(video)return video;
    throw new Error('Upload has no final completion response');
  } finally {fs.closeSync(fd);}
};
