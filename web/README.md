# @drongo/web

The **Next.js** front end for Drongo AI — confidential pay-per-use settlement
between autonomous agents. Today it serves the marketing site; the **agent
dashboard** (see your agents, watch the provider get used and charged, inspect
channel settlements) will live here next.

Built with the **App Router**, **TypeScript**, and `next/font` for self-hosted
**Inter Tight** and **Playfair Display**. The visual language — dark / light /
accent section rhythm, a single mint accent, SVG diagrams, and physics-eased
motion — is hand-authored CSS in [`app/globals.css`](./app/globals.css),
deliberately free of the "AI-generated" tells (no emoji icons, no gradient text,
one hue).

## Run it

Requires **Node.js ≥ 18.18** (Next 15). `npm`, `pnpm`, and `yarn` all work.

```bash
cd web
npm install
npm run dev        # http://localhost:3000

npm run build      # production build
npm run start      # serve the production build
```

> `next/font` fetches the Inter Tight / Playfair Display files at build time, so the
> first `dev`/`build` needs network access; after that they're cached and
> self-hosted (no runtime requests to Google Fonts).

## Layout

```
web/
  app/
    layout.tsx        root layout — fonts (next/font), <html>/<body>, metadata
    page.tsx          composes the landing sections in order
    globals.css       the full design system (tokens, sections, motion)
  components/
    Announce.tsx      top announcement bar
    Nav.tsx           sticky nav
    Hero.tsx          animated constellation hero (SVG + SMIL packets)
    Problem.tsx       "metered commerce leaks everything" — 3 cards
    HowItWorks.tsx    4 steps + public/private split
    Features.tsx      6 feature cards with SVG tiles
    Flow.tsx          "Inside a channel" sequence diagram
    AccentBand.tsx    the 7,431 / 1 / 0 stat band
    Tech.tsx          tech-stack strip
    Sponsors.tsx      sponsors & ecosystem
    Cta.tsx           closing call to action
    SiteFooter.tsx    footer
    ScrollReveal.tsx  'use client' — IntersectionObserver scroll motion
```

All sections are server components; only `ScrollReveal` runs on the client. It
adds the reveal classes after mount, so with JavaScript disabled or
`prefers-reduced-motion` set, the page renders fully visible and static.

## Roadmap — the dashboard

The next milestone is an authenticated dashboard under `app/dashboard/`:

- **Agents** — list the consumer/provider agents you own and launch a run.
- **Live usage** — watch the provider agent serve metered calls in real time.
- **Charges** — per-channel escrow, units served, and the single on-chain
  settlement (amount, nullifier, proof) once a channel closes.

It will read from the `@drongo/agent` harness in [`../agent`](../agent).
