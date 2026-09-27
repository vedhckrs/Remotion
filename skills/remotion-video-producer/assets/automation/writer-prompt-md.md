Write the voiceover script for one video as Markdown. Reply with the Markdown only: no introduction, no code fences, no notes after it. Do not use any tools.

Video: {{kind}} for {{platforms}}, about {{targetSeconds}} seconds of voiceover (about {{targetWords}} spoken words in total).
Channel: {{handle}}.
Topic: {{topic}}

Format (a parser reads this exactly):

# Video title

## On-screen headline of 2 to 6 words with one **highlight** word
[icons: lucide:smartphone=Phone, lucide:wifi=Wi-Fi]
(delivery: excited)
The voiceover for this scene: plain spoken words, with the key word in **bold**.

## 79 narrow **channels**
- Channels: 79
Voiceover for a scene built around one number.
> Source: where the number comes from

Optional lines, only where they help:
- `[icons: ...]` when brands, apps or devices are named. Two to four icons are drawn as a signal path joined by glowing wires, so list them in the order the data travels (`[icons: lucide:smartphone, lucide:wifi, lucide:router]`). Give every icon in a path a short label with `=Label` (`lucide:router=Router`), or none of them. Pick the icon that shows the thing itself (lucide:microwave for a microwave, lucide:headphones for earbuds, lucide:bluetooth, lucide:key-round, lucide:radio-tower, lucide:cable, lucide:server, lucide:cloud). Icons: Simple Icons slugs (youtube, instagram, whatsapp, google, apple, android, netflix, spotify) or `lucide:` UI icons (lucide:wifi, lucide:smartphone, lucide:router, lucide:battery, lucide:cpu, lucide:globe, lucide:zap, lucide:lock, lucide:signal, lucide:satellite).
- `[bg: ...]` one of solid, tonal, spotlight, grid, dots, particles, rays, waves, streaks, paper.
- `(delivery: excited | calm | serious | curious)`.
- One line like `- Channels: 79` makes a big animated number; three or more lines like `- 4G: 20 Mbps` make a bar chart. Only real numbers you are sure of, with a `> Source:` line (it is shown small in the corner).
- `[neon]` at the start of a scene for one punchline.

Rules:
- A short changes picture every 2 to 4 seconds: 10 to 14 scenes of 6 to 12 spoken words each. A long video has 20 to 40 scenes of 10 to 25 words.
- Every scene has a visual: an `[icons: ...]` line, a number line, or `[neon]` (at most once). Never two plain text scenes in a row.
- Scene 1 is the hook: a surprising claim or the payoff, voiceover under 12 words.
- One idea per scene, simple words for a general audience, second person ("you", "your phone").
- No emojis, no hashtags, no claims you cannot back.
- The last scene loops back to the hook instead of summarising.
