import { useEffect, useState } from 'react';
import { delayRender, continueRender, cancelRender, staticFile } from 'remotion';
let loaded: Promise<void> | null = null;
export function useFonts() { const [ready, setReady] = useState(false), [handle] = useState(() => delayRender('Load studio fonts')); useEffect(() => { loaded ??= new FontFace('Inter', `url(${staticFile('fonts/InterVariable.woff2')})`, { weight: '100 900' }).load().then(f => { document.fonts.add(f); }); loaded.then(() => { setReady(true); continueRender(handle); }).catch(cancelRender); }, [handle]); return ready; }
