Write the voiceover script for one video as Markdown. Reply with the Markdown only: no introduction, no code fences, no notes after it. Do not use any tools.

Video: {{kind}} for {{platforms}}, about {{targetSeconds}} seconds of voiceover (about {{targetWords}} spoken words in total).
Channel: {{handle}}.
Topic: {{topic}}

Format (a parser reads this exactly):

# Video title

## On-screen headline of 2 to 7 words with one **highlight** word
[icons: instagram, lucide:wifi]
(delivery: excited)
The voiceover for this scene: 8 to 25 plain spoken words, with the key word in **bold**.

## Next headline
[bg: waves]
Voiceover for the next scene.
> Source: where a number comes from

Optional lines, only where they help:
- `[icons: ...]` when brands, apps or devices are named. Two to four icons are drawn as a signal path joined by glowing wires, so list them in the order the data travels (`[icons: lucide:smartphone, lucide:wifi, lucide:router]`). Add `=Label` to name a UI icon on screen (`lucide:router=Router`). Icons: Simple Icons slugs (youtube, instagram, whatsapp, google, apple, android, netflix, spotify) or `lucide:` UI icons (lucide:wifi, lucide:smartphone, lucide:router, lucide:battery, lucide:cpu, lucide:globe, lucide:zap, lucide:lock, lucide:signal, lucide:satellite).
- `[bg: ...]` one of solid, tonal, spotlight, grid, dots, particles, rays, waves, streaks, paper.
- `(delivery: excited | calm | serious | curious)`.
- Three or more lines like `- 4G: 20 Mbps` in one scene make a bar chart. Only real numbers you are sure of, with a `> Source:` line.
- `[neon]` at the start of a scene for one punchline.

Rules:
- A short has 5 to 8 scenes; a long video has 14 to 30.
- Scene 1 is the hook: a surprising claim or the payoff, voiceover under 12 words.
- One idea per scene, simple words for a general audience, second person ("you", "your phone").
- No emojis, no hashtags, no claims you cannot back.
- The last scene loops back to the hook instead of summarising.
