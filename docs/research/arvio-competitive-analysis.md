# Competitive analysis — ARVIO (arvio.tv)

Captured 2026-10-09 with Playwright + headless Chromium (landing page at 1440×900 and 390×844, plus ARVIO's
published in-app screenshots). Images live in [`arvio/`](arvio/).

| File | What it shows |
|---|---|
| `arvio/landing-hero.jpg` | Marketing landing page hero |
| `arvio/tv-01-home.jpg` | TV home: billboard hero + Continue Watching row |
| `arvio/tv-02-details.jpg` | TV details page: hero art, primary action, season chips |
| `arvio/web-07-services.jpg` | Per-service shelves (Netflix, Disney+…) |
| `arvio/phone-01-home.jpg` | Phone home: carousel hero, shelves, bottom tab bar |

## What ARVIO is

ARVIO is an Android TV / phone / web media hub. It aggregates Jellyfin/Plex/Emby libraries, Trakt, IPTV and
add-ons into one 10-foot UI. It isn't a direct competitor; it doesn't drive Netflix and the other streaming web apps
from a laptop. It is the closest consumer-grade reference for a remote-first, "one home for everything" media UI,
and it looks like a finished product where Bedrock looked like a side project.

## What makes it read as a product

1. **Billboard hero.** The top ~55% of Home is a full-bleed backdrop for the focused or most relevant title: logo-type
   title, metadata line, 2–3 line synopsis. The background fades into the page with a left-to-right and
   bottom scrim, so text stays legible on any art.
2. **Top navigation pill.** Search · Home · Library · TV are centered, and the active tab sits in a translucent
   capsule. Avatar on the left, settings and a **clock** on the right. The clock matters at night.
3. **Landscape cards with status badges.** Continue Watching cards are 16:9 art with small translucent capsules in
   the corners ("29 eps left", "New Episode", "S1 • E2", "2hr 33min left") and a thin progress bar.
4. **Focus is unmistakable.** The focused card gets a solid white 3–4px rounded border and a slight scale-up.
   Unfocused cards stay at full color, so the page doesn't look disabled.
5. **Per-service shelves.** Content is grouped by service (Netflix, Disney+) with the service name as a large
   shelf title.
6. **Primary action pill.** On details, the white capsule "▶ Continue S4E8" is the only filled control. Secondary
   actions are icon-only.
7. **Phone: carousel hero + bottom tab bar + "View all".** It follows standard mobile patterns and needs no learning.
8. **Copy speaks to people.** "Your media. Beautifully connected.", "From the couch. To wherever." There are no
   IPs, no protocol names, no uppercase status codes.

## Where Bedrock was (before screenshots in [`../screenshots/before/`](../screenshots/before/))

- Brand was a wordmark with odd casing ("Bedrock"). There was no mascot, icon or startup moment.
- Home was a static dashboard: a heading, two oversized logo cards and four small tiles. It had no hero and no
  ambient info (clock), and the decorative ⚙ did nothing.
- The pairing footer exposed `http://IP:port`, mDNS hostnames and raw codes. It was developer text with no QR code.
- D-pad focus covered only the Sources grid. Continue Watching cards couldn't be reached with the remote.
- Phone remote: uppercase `CONNECTED` status, a grey slab trackpad, raw command names in toasts
  (`toggle-play-pause`, `nav:up`) and text buttons for transport ("Seek −").

## What we adopt for Bedrock (implemented in the revamp)

| ARVIO pattern | Bedrock adaptation |
|---|---|
| Billboard hero | Hero shows the most recent playback-history item: blurred artwork (or brand-color field from the source), title, source and progress, with a white **Resume** pill. If there's no history, a welcome hero with the mascot. |
| Top nav pill + clock | Top bar: mascot app icon + "Bedrock", centered status capsule, live clock on the right. |
| Badged 16:9 cards + progress | Continue Watching row: 16:9 cards with "x min left" / source capsules and a progress bar. |
| White focus ring + scale | tvOS-style focus: scale 1.06–1.08, lifted shadow, white 3px inner ring, specular sheen. |
| Shelf titles | Sections titled "Continue Watching" and "Your Apps" in title-2 weight. |
| Human copy | Status "iPhone connected" or "Ready to pair". Toasts like "Paused" or "Skipped back 10 s". |
| Phone patterns | iOS large-title header, segmented control, Siri Remote–style clickpad, icon transport bar, HUD toasts. |

What we leave out: per-service content shelves and a details page. Bedrock can't see the catalogs of
Netflix/Prime/Hotstar. The PRD treats scraping as best-effort only, so faking catalog shelves would be dishonest
UI.
