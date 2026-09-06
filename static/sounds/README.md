# Ambient track

Drop a file here named `ambient.mp3` and the site uses it automatically,
looped, with a 3-second fade-in. Remove it and the synthesised generative
notes play instead — the site is never silent either way.

Nothing else needs changing. The path and level live at the top of
`src/lib/audio/engine.js` (`TRACK_URL`, `TRACK_LEVEL`).

## Use a track you actually have the rights to

A background track on a public site is a public performance of that recording.
Ripping a commercial song exposes the site owner to a takedown or a claim, so
use one of these instead:

| Source | Licence | Notes |
|---|---|---|
| Pixabay Music | Royalty-free, commercial OK | No attribution required |
| Free Music Archive | Creative Commons (varies) | Check each track — some are non-commercial only |
| ccMixter | Creative Commons | Attribution usually required |
| YouTube Audio Library | Royalty-free | Free, some tracks need attribution |
| Uppbeat / Epidemic Sound / Artlist | Subscription | Cleanest option for a commercial site |
| Commission a musician | Whatever you agree | Get the web/commercial rights in writing |

Whichever you pick, confirm the licence covers **commercial use on a website**.
"Free to download" is not the same as "free to publish".

## Practical notes

- Keep it small. It is fetched during the preloader, so a 2–4 MB file is
  sensible; anything much larger and the gate sits there.
- Loop cleanly. Trim so the end meets the start without a click.
- Mix it quiet. It sits under the whole site, not in front of it.
