# bevishnu.com/poker: how it all fits together

A guide for future me: what runs where, how to change it, how to ship it, and what to do when something breaks. For the code internals (engine, bot pipeline, table object), see [architecture.md](architecture.md). For the C++ bot platform, see the [README](README.md).

---

## 1. The big picture

```
 visitor's browser
   │  https://bevishnu.com/poker/...
   ▼
 Worker "bevishnu"                  repo: beVishnu (branch main)
   │  serves the homepage; for /poker and /poker/* only, strips "/poker"
   │  and forwards through the service binding POKER (no public URL in between)
   ▼
 Worker "poker-dashboard"           repo: poker_tourney, folder dashboard/
   │  static pages from dashboard/out/: arena, builder, tables
   │  /api/table/<code>/ws  →  WebSocket into a Durable Object
   ▼
 Durable Object "PokerTable"        dashboard/worker/pokerTable.js
      one per table code: deck, seats, chips, chat, PIN; runs the game
```

Two repos, two Workers, both on the same Cloudflare account:

| | **beVishnu** | **poker_tourney** (this repo) |
|---|---|---|
| GitHub | github.com/VishnuXD44/beVishnu | github.com/VishnuXD44/poker_tourney |
| Live branch | **`main`** (⚠ `master` is stale, see §6) | `main` |
| Cloudflare Worker | `bevishnu` | `poker-dashboard` |
| Serves | bevishnu.com and www.bevishnu.com | everything under /poker (no URL of its own) |
| Deploy from | repo root: `npm run deploy` | `dashboard/`: `npm run deploy` |
| Needs a deploy when | the homepage changes, or the /poker forwarding changes | anything about poker changes (almost always this one) |

**Rule of thumb:** poker changes only ever need the poker_tourney repo. The beVishnu Worker just forwards `/poker/*` and never needs redeploying for poker work.

---

## 2. What's on the site

| URL | What it is | Server needed? |
|---|---|---|
| bevishnu.com/poker | **Bot arena**: house bots and your saved strategies play each other. Up to 10,000 hands per match. | No, runs entirely in the visitor's browser |
| bevishnu.com/poker/builder | **Strategy builder**: drag-and-drop bot design. Strategies are saved in the browser (localStorage). | No |
| bevishnu.com/poker/table | **Private tables**: real people play each other live. | Yes, the PokerTable Durable Object |

The C++ bot upload from the README (Node server in `server/`) is **local only**. The public site can't compile or run C++, and running strangers' code on a server isn't worth the risk. Locally, `dashboard/.env.development` points the dashboard at that server; the public build leaves `NEXT_PUBLIC_API_URL` unset, which switches to browser mode.

---

## 3. Private tables: how they work (user view)

1. Go to **/poker/table**, choose a **PIN** (4–12 letters or digits), click **open a new table**.
2. The lobby shows the **invite link** and the PIN. Send both to the other player, ideally in separate messages.
3. They open the link, enter the PIN, type a name, **take a seat**. Up to 6 seats.
4. The first person seated is the **host**: sets stack and blinds, clicks **deal**, can **pause after this hand** and resume later.
5. During play:
   - Buttons: fold, check/call, all-in, and a bet/raise slider with ½-pot and pot shortcuts. On phones the buttons stick to the bottom of the screen.
   - The tab title shows **● your turn** when it's your move.
   - After each hand a **why** box explains the result, e.g. "two pair beats a pair", or kickers.
   - The next hand deals after 12 s, or as soon as everyone clicks **next hand**.
   - The **hand guide** sidebar shows what your cards are worth and the ranking ladder.
   - **Sound on/off** sits by the connection status; the choice is remembered per browser.
6. No hand limit. When one player has every chip, both screens show **request rematch**; the game restarts once everyone agrees.
7. When you're done, **delete this table** (lobby or game-over screen, with confirmation) erases it forever for everyone.

Refreshing or losing connection is fine: each browser remembers its PIN and seat for that table code, and reconnects automatically.

---

## 4. Private tables: how they work (under the hood)

- **Table code** (`?room=xxxxxxxx`): 8 random characters made in the browser. It's the Durable Object's name (`idFromName(code)`), so the same code always reaches the same object.
- **PIN:** the first person to reach a fresh table sets it. Until a socket sends the right PIN it gets nothing except `{type:"locked"}`. After 10 wrong PINs in 10 minutes, the table refuses all PINs for the rest of that window (people already in stay connected). The counter is in memory, so a restart resets it.
- **Seats:** claimed with a random token saved in the browser's localStorage. That's how a refresh gets the same seat back without logging in.
- **Hidden cards:** the deck and everyone's hole cards exist only inside the object. Each socket gets its own view: your cards, plus others' only when they're shown at showdown.
- **Game loop:** the same engine as the arena (`server/game/pokerGame.js`). Each player's "decision" is a promise that resolves when their WebSocket sends an action.
- **Saving:** seats, chips, button, hand count, chat, last hand and PIN are written to the object's storage after every hand. If the object restarts (deploys do this), the hand in progress is lost and the table reopens paused in the lobby at the last finished hand. The host clicks **resume**.
- **Deleting:** `storage.deleteAll()`, then everyone with the PIN is told who deleted it, and all sockets close. The code afterwards opens as a brand-new table.
- **Security checks in `dashboard/worker/index.js`:** only `/api/table/<code>/ws` WebSocket upgrades are accepted, and only from a page on the same host (Origin check), so other websites can't connect.

### Where data lives

| Data | Where | Gone when |
|---|---|---|
| Seats, chips, chat (last 50), last hand, **PIN** | Durable Object storage on Cloudflare (stored as plain text, readable only from your Cloudflare account) | Someone deletes the table |
| PIN and seat token per table | Each player's browser localStorage (`poker-table-pin:<code>`, `poker-table-token:<code>`) | Table deleted while that browser is connected, or browser data cleared |
| Your name, sound on/off | Browser localStorage (`poker-table-name`, `poker-sound-muted`) | Browser data cleared |
| Builder strategies | Browser localStorage | Browser data cleared |

Tables that are never deleted stay stored on Cloudflare, idle. They cost essentially nothing while idle, but deleting tables you're done with keeps things tidy.

### Limits worth knowing

- **Nobody times out.** If someone closes the tab on their turn, the game waits until they're back.
- **Deploys interrupt hands in progress** (see "Saving" above). Avoid deploying while someone is mid-game.
- **Durable Object usage counts against the Cloudflare plan.** A WebSocket keeps the object awake while anyone has the page open. That's fine for casual play; check *Workers & Pages → poker-dashboard → Metrics* in the Cloudflare dashboard if you're ever unsure.
- **The PIN is a door lock, not an account system.** Anyone with both the link and the PIN can get in.

---

## 5. Making a change

### Where things are

```
dashboard/
  app/page.js             arena page          app/builder/page.js   builder page
  app/table/page.js       private tables page (lobby, table, chat, sounds wiring)
  app/layout.js           root layout: mounts the navbar on every page
  components/NavBar.js    site-wide terminal-style navbar
  components/HandGuide.js beginner sidebar on the tables page
  components/LiveTable.js arena table + the shared "why" box (WinReason)
  lib/hands.js            hand names, win explanations, best five, starting-hand strength
  lib/sounds.js           Web Audio sound effects + mute
  lib/localArena.js       runs arena matches in the browser
  worker/index.js         poker-dashboard Worker entry: routes /api/table/* sockets
  worker/pokerTable.js    the PokerTable Durable Object (all table rules live here)
  wrangler.jsonc          Worker config: assets, Durable Object binding, migrations
  public/_headers         security headers (CSP etc.) for the static files
server/game/              the poker engine, shared by the server, the arena and the tables
```

### Run it locally

| To work on… | Run (inside `dashboard/`) | Open |
|---|---|---|
| Arena / builder only | `npm run dev` | http://localhost:3001 |
| **Tables** (needs the Worker + Durable Object) | `npx next build && npx wrangler dev` | http://localhost:8787/table |

`npm run dev` has no Worker, so tables there will never connect. Use `wrangler dev` for anything table-related. To test multiplayer, open the table in two different browsers (or one normal and one private window), since each browser is one player.

Local test tables are stored in `dashboard/.wrangler/state/v3/do/`. Delete that folder to wipe them (it's git-ignored).

### Before shipping: quick checklist

- [ ] `npx next build` passes.
- [ ] Two windows on `wrangler dev`: open a table, wrong PIN rejected, right PIN works, both take a seat, deal.
- [ ] Play a few hands: check, call, raise, fold, all-in. The "why" box makes sense.
- [ ] Shove until someone busts; request and accept a rematch on both screens.
- [ ] Refresh one window mid-game: same seat, no PIN prompt.
- [ ] Delete the table: both windows show "deleted"; reopening the link gives a fresh table.
- [ ] Look at it at phone width (browser dev tools): no sideways scrolling, buttons reachable.
- [ ] If you changed the engine: `cd server && npm test`.

---

## 6. Shipping

### Deploying the poker site (the usual case)

```bash
cd ~/Desktop/poker_tourney
git add <files> && git commit -m "…"
cd dashboard
npm run deploy          # = BASE_PATH=/poker next build, then wrangler deploy
cd .. && git push origin main
```

- `npm run deploy` prints **"No targets deployed for poker-dashboard"**. That's expected: this Worker has no URL of its own.
- Check it live: open https://bevishnu.com/poker/table.
- Deploy when no one is mid-hand (hands in progress are lost on deploy).
- If wrangler says you're not logged in: `npx wrangler login`.

### Changing the Durable Object's shape

- Changing `pokerTable.js` logic: just deploy.
- **Renaming or removing the `PokerTable` class, or editing the existing `v1` migration: don't.** Cloudflare tracks the class by those migrations. Renaming or removing it needs a *new* migration entry (`"tag": "v2"`, with `renamed_classes` or `deleted_classes`), and deleting the class **wipes every table**.

### Deploying the homepage (beVishnu repo), only when you actually change it

⚠ **beVishnu's live branch is `main`, but the local checkout and GitHub's default branch have been `master`, which is stale.** On 2026-10-28, a deploy from `master` once rolled the live homepage back to an old design. Before deploying beVishnu:

```bash
cd ~/Desktop/Bevishnu
git fetch
git switch main                        # or use a separate worktree if you have local edits
npx wrangler deployments list          # compare with what's live
npm run deploy
```

beVishnu's `wrangler.jsonc` (on `main`) must keep the service binding `{ "binding": "POKER", "service": "poker-dashboard" }` and `run_worker_first: ["/poker", "/poker/*"]`, or /poker stops working. Deploy `poker-dashboard` first if it ever has to be recreated, because the binding must point at an existing Worker.

### Rolling back

```bash
cd ~/Desktop/poker_tourney/dashboard
npx wrangler deployments list           # find the last good version
npx wrangler rollback <version-id>
```

Same commands in `~/Desktop/Bevishnu` for the homepage Worker. Rolling back code doesn't touch stored tables.

---

## 7. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Table page stuck on "connecting…" or "reconnecting" | Is `poker-dashboard` deployed? Locally, are you on `wrangler dev` (not `npm run dev`)? Check the browser console for CSP errors. `public/_headers` must allow `wss://bevishnu.com` in `connect-src`. |
| "wrong PIN" with the right PIN | PINs are case-sensitive. A deleted-and-reopened table may have a new PIN. |
| "too many wrong PINs" | 10 misses in 10 minutes. Wait it out; people already at the table aren't affected. |
| Game is frozen | Someone is "away" (their badge says so) on their turn. They need to come back; there's no auto-fold. |
| Table went back to the lobby by itself | The object restarted (usually a deploy). Chips are from the last finished hand; host clicks **resume**. |
| "a game is in progress" when joining | New seats open only between games. Wait for the game to end, or the host pauses. |
| No sound | Click anywhere on the page first (browsers block audio until you interact), and check **sound on**. iPhones in silent mode mute web audio. |
| /poker itself is down but bevishnu.com works | The `bevishnu` Worker's forwarding or the `poker-dashboard` Worker. Check both in the Cloudflare dashboard; see §6. |
| Socket rejected with 403 | The Origin check: the page and the socket must be on the same host. Expected for other sites; shouldn't happen on bevishnu.com. |

---

## 8. History

| Date | Commit | What |
|---|---|---|
| 2026-10-28 | `9796909` | Dashboard shipped to bevishnu.com/poker as a static, browser-only arena |
| 2026-10-28 | `8391e0f` | Private multiplayer tables (Durable Object), then PIN-protected |
| 2026-10-28 | `ea2e38f` | Rematch voting, win explanations, hand guide, sounds, full-width layout, new navbar, 10,000-hand arena |
| 2026-10-28 | `6318570` | Delete a table forever |

Known leftover: one test table from the first live check (players "a" and "c", PIN `9999`, random code) sits idle in Cloudflare storage. It's harmless, and it can't be removed individually without its code.
