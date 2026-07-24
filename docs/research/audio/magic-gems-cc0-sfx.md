# Magic Gems — Public-Domain / CC0 Sound Research

**Date:** 2026-07-24 · Research only — no audio wired into the game yet. Sound is
not part of the frozen `SPEC.md`; this is a menu of license-clean options for the
Owner to choose from, after which it will be specced as a proper feature.

All sources below are **CC0 / public domain** unless flagged — safe to copy into the
shipped game folder, use commercially, and redistribute, with **no attribution
required**.

## Recommended core: 3 downloads cover all 9 core SFX

| Pack | Covers | License | URL |
|------|--------|---------|-----|
| Kenney "Interface Sounds" (100 sounds, OGG) | cursor move, select, swap, invalid, drop/land, score chime | CC0 | https://kenney.nl/assets/interface-sounds |
| Kenney "Digital Audio" (60 sounds, OGG) | cascade/combo rising tones | CC0 | https://kenney.nl/assets/digital-audio |
| rubberduck "75 CC0 breaking/falling/hit sfx" | **glassy gem-shatter** (the one thing Kenney lacks) | CC0 | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx |

Kenney CC0 statement: https://kenney.nl/support — "all game assets on the asset
pages are public domain licensed (CC0)… free to use, even in commercial projects."
All Kenney packs also bundled in "Kenney Game Assets All-in-1": https://kenney.itch.io/kenney-game-assets

## Per-event shortlist

| # | Event | Candidate | Source | License |
|---|-------|-----------|--------|---------|
| 1 | Cursor move | `click_00x.ogg` / `switch_00x.ogg` | Kenney Interface Sounds | CC0 |
| 2 | Gem select (SPACE) | `select_00x.ogg` / `confirmation_001.ogg` | Kenney Interface Sounds | CC0 |
| 3 | Valid swap | `switch_00x.ogg` | Kenney Interface Sounds | CC0 |
| 4 | Invalid swap / revert | `error_00x.ogg` | Kenney Interface Sounds | CC0 |
| 5 | Match clear / gem shatter | glass entries in `sfx_breaking_and_falling.zip` | OGA rubberduck 75-pack | CC0 |
| 5-alt | Shatter (chime variant) | bell + glass in "100 CC0 SFX" | https://opengameart.org/content/100-cc0-sfx | CC0 |
| 6 | Cascade / chain step | `highUp.ogg`, `pepSound1/2.ogg` (rising tones, higher per chain step) | Kenney Digital Audio | CC0 |
| 7 | Gems falling into place | `drop_00x.ogg`; or Kenney Impact Sounds (130×) | Kenney Interface / Impact | CC0 |
| 8 | Auto-reshuffle (whoosh) | noise/spring in "100 CC0 SFX"; or Freesound filtered CC0-only | OGA / Freesound | CC0 (see gap) |
| 9 | Score / combo award | `confirmation_001.ogg`; higher pitch = bigger combo via `highUp.ogg` | Kenney Interface / Digital | CC0 |
| 10 | Ambient loop (optional) | per-track pick from "CC0 - Calm / Relaxing Music" | https://opengameart.org/content/cc0-calm-relaxing-music | CC0 claimed — verify each track |

## Gaps / cautions
- **Whoosh for reshuffle:** no perfect dedicated CC0 whoosh found; closest is the
  OGA noise/spring, or filter Freesound to **CC0 only** and verify each sound's badge.
- **Ambient music:** the OGA calm-music collection is mixed-author — verify each
  track's own license before shipping. Unverified alternative: Tallbeard Studios
  "FREE Music Loop Bundle" (itch.io, claims 200+ CC0 loops).
- **Freesound in general:** mixes CC0 / CC-BY / CC-BY-NC — only use with the license
  filter set to **CC0**, re-checked per sound. FAQ: https://freesound.org/help/faq/#licenses
- Per-file byte sizes/lengths not confirmed individually; all clips reported <1.5s, OGG.

## If adopted
Recommended layout: `assets/audio/<event>.ogg`, plus an `assets/audio/CREDITS.txt`
mapping each file → event → source URL → license (good hygiene even for CC0).
