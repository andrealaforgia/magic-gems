# Magic Gems — Real-Time Internet Multiplayer: Options Research

**Date:** 2026-07-24 · Research only — nothing built. A menu of architectures for
the Owner to choose from before this is specced as a feature.

## The one fact that shapes everything
A purely static site **cannot introduce two arbitrary players to each other** over
the internet. Something network-reachable must broker or relay the connection. The
*client* can stay a copy-deployable static folder in every option below except
"host your own WebSocket server." What this breaks in `SPEC §1.3` is the clause
**"no external runtime dependencies"** — multiplayer adds a runtime dependency on a
realtime service. That's a spec amendment, not a redeploy-model rewrite.

## Recommendations (solo hobby dev, minimal ops, low/no cost)

**1. Primary — PeerJS (WebRTC peer-to-peer + PeerJS's free public broker).**
- Client stays 100% static; **no server to run**; $0; lowest latency (direct peer link).
- The **10-letter code = the peer ID** — a near-perfect fit ("host" claims the code as its ID, "joiner" connects to it). Prefix it (e.g. `magicgems-<code>`) to avoid collisions on the shared public broker.
- Trade-offs: public broker is "not for production" (no SLA); some restrictive/symmetric NATs need a **TURN relay** fallback; **no persistence** (a dropped peer = fragile reconnect); scores are self-reported (**cheatable** — fine for friendly play).

**2. More reliable, still no server you operate — Supabase Realtime Broadcast (or Ably).**
- Static client + managed realtime service; the **code = a channel name**.
- Server-timestamped messages → clean shared-timer sync; channels survive brief disconnects (reconnect-by-code works). Generous free tiers (Supabase ~200 conns/~2M msgs mo; Ably ~6M msgs/mo) dwarf a 2-player game.
- Trade-offs: adds a third-party account + API key (the `§1.3` runtime-dependency amendment); still just a relay (no built-in anti-cheat).

**Escalation (only if server-authoritative scoring/anti-cheat ever matters):**
PartyKit (Cloudflare Durable Objects, free tier, room-per-party) keeps the client
static while adding a tiny edge server. **Avoid** self-hosted WS relays
(Colyseus/Nakama/ws) for two friendly players — most ops/cost for least benefit.
Firebase free tier caps at 100 simultaneous connections (can't be raised) — fine
for two, poor fit as a message bus.

## Building blocks (independent of the transport chosen)
- **Identical starting board:** seed a PRNG (e.g. mulberry32) from a hash of the
  shared 10-letter code, replacing `Math.random` in board fill. Same code → same
  board on both sides, guaranteed. **Open decision:** whether post-start *refills*
  also stay in sync (lockstep) or each player's board diverges after t=0. Most
  competitive match-3 games let boards diverge — only the *start* must match.
- **Showing the remote grid/moves:** send **periodic/on-change full-board snapshots**
  (an 8×8 board + score is a few hundred bytes — trivial). Self-correcting; no need
  to keep two logic engines in lockstep. Preferred over replaying discrete moves.
- **Timer sync:** broadcast an agreed `startAt` timestamp; both count down 10 min
  from it. Managed services can anchor to server time; sub-second client skew is
  irrelevant over a 10-minute match.
- **Who's-winning gauge:** a live comparison of the two exchanged scores.
- **Trust:** with P2P or a plain relay there's no authority, so scores are
  cheatable. Acceptable for friendly play; PartyKit/Colyseus add authority later.

## Size of the change
- **Ops:** small with PeerJS/BaaS (config + maybe an API key; no new infra); large only if self-hosting a relay.
- **Code:** a moderate feature — (1) seeded PRNG + refill-policy decision; (2) a networking module (join-by-code, snapshot send/receive); (3) lobby + name entry + split-screen render of the remote grid + centre win-gauge + shared countdown + end/winner screen.

## Caveats
Cloud free-tier numbers shift often — re-verify each vendor's pricing/limits page at
build time. TURN-necessity rate is network-dependent — prototype STUN-only, add TURN
if real users hit connection failures. Full sources and free-tier citations are in
the research agent's report (relayed to the Owner in-session).
