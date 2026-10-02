import { spawnSync } from 'node:child_process';
/** Inspect isolated fixture bands to catch early SFX and inverted narration ducking. */
export function bandVolume(file: string, frequency: number, start: number, duration: number) {
    const result = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(start), '-t', String(duration), '-i', file, '-vn', '-af', `bandpass=f=${frequency}:width_type=h:w=40,volumedetect`, '-f', 'null', '-'], { encoding: 'utf8' });
    if (result.status !== 0)
        throw new Error('Cannot inspect mixed audio');
    return Number(result.stderr.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1] ?? '-Infinity');
}
export function verifyAudioFixture(file: string) {
    const musicBefore = bandVolume(file, 220, .3, .4), musicDuring = bandVolume(file, 220, 1.6, .25);
    const sfxBefore = bandVolume(file, 880, .6, .3), sfxDuring = bandVolume(file, 880, 1.25, .15), sfxAfter = bandVolume(file, 880, 2.4, .3);
    if (musicBefore - musicDuring < 4)
        throw new Error('Music does not duck under word cues');
    if (sfxDuring - Math.max(sfxBefore, sfxAfter) < 12)
        throw new Error('SFX is missing or occurs outside its scheduled cue');
    return { musicBefore, musicDuring, sfxBefore, sfxDuring, sfxAfter };
}
