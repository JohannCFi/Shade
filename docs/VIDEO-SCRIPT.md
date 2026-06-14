# Shade — demo video script (~2:45)

Target length **2.5–3 min**. Format: screen recording + voiceover. Each scene has
**[ON SCREEN]** (what to show) and **SAY** (read aloud, English). Hits every track
requirement: Dynamic, Unlink, Circle/Arc, what's private, deployed, GitHub.

> ✅ Before recording, run `npm run circle:pay` once and make sure it succeeds — the
> Circle micro-settlement must be shown working live (the track requires "real
> gas-free micro-settlement, not a single large transfer").

---

## 0:00 — Hook (the problem) · 15s
**[ON SCREEN]** Landing page of the deployed app (the headline "Be invisible on-chain").
**SAY:**
> "Machines are starting to pay each other — for data, inference, compute — thousands
> of times a day, in sub-cent amounts. But on a public chain, every one of those
> payments is a footprint. Anyone can watch an agent's spend, infer its strategy, and
> map who it pays. **Shade makes those nanopayments private.**"

## 0:15 — The contrast demo · 40s  *(the wow — and what's private)*
**[ON SCREEN]** Go to `/spy`. Click **Run agent live**. Let the top "AGENT" panel
stream, the left panel fill red, the right stay dark.
**SAY:**
> "Same agent, two rails. On the left — bare, transparent payments. A competitor's spy
> indexer reconstructs everything: the funder, which oracles it queries, the budget,
> the whole strategy. On the right — the *same* agent routed through **Unlink** private
> accounts. Identical activity… and the spy sees only noise. Funder, amounts,
> counterparties, strategy — all hidden."

**[ON SCREEN]** Click a tx hash → ArcScan. Then click **verify on engine**; show the
"cashed out → public" withdrawal links.
**SAY:**
> "These are real on-chain transactions — and the private payments are real too: each
> oracle withdraws what it received to a public address, so anyone can verify value
> moved… **without ever revealing who paid whom.**"

## 0:55 — Dynamic onboarding · 30s
**[ON SCREEN]** Go to `/app`. Click **Connect wallet** → the **Dynamic** modal →
connect. Then **Deploy my bot** (show the signature). Show the `Bot: unlink1…` identity.
**SAY:**
> "Onboarding is **Dynamic**. The user connects an embedded wallet — no seed phrase.
> They sign **one** message, and that signature deterministically derives their private
> Unlink identity. One wallet equals one bot. From here on, the per-payment signing is
> off-chain — **no popup per payment.**"

## 1:25 — Fund + Circle nanopayment settlement · 35s
**[ON SCREEN]** In `/app`, click **Plug in (fund)** (a USDC deposit on Arc). Then cut to
a terminal and run `npm run circle:pay`; show it settle.
**SAY:**
> "Funding deposits USDC into the user's private pool on **Arc** — where gas is paid in
> USDC and settlement is high-throughput, so sub-cent payments actually make sense. The
> paid-oracle rail settles through **Circle Gateway**: each call returns HTTP 402, the
> agent signs an EIP-3009 authorization, and Circle's facilitator **verifies and
> settles it gas-free, in batches.** Here's a real Circle nanopayment landing — cents,
> not a single big transfer."

## 2:00 — Bring your own bot · 30s
**[ON SCREEN]** Terminal: run `npx tsx scripts/my-bot.ts` — show the private transfers
streaming. Back in `/app`, **Refresh** → the activity appears. Optionally connect a
second wallet and run `my-bot-2.ts` to show a second, isolated bot.
**SAY:**
> "And any developer can plug in their **own** bot. They keep their strategy — they just
> route data payments through Shade with a few lines. The bot authenticates with its own
> wallet signature, so it never holds the admin key, and it can only spend its own
> budget. A different wallet is a completely separate, private bot."

## 2:30 — Close · 15s
**[ON SCREEN]** Split view: the `/spy` contrast on one side, the architecture diagram
(`docs/architecture-diagram.html`) on the other. End on the GitHub URL.
**SAY:**
> "**Dynamic** for the wallet and identity, **Unlink** for private accounts and routing,
> **Circle on Arc** for gas-free USDC settlement. Private nanopayments for autonomous
> agents — deployed, open-source, and live on Arc testnet. That's Shade."

---

## Shot checklist (so nothing is missed)
- [ ] `/spy` live run — left reconstructs, right blind
- [ ] An ArcScan tx link + **verify on engine** withdrawal proof (Unlink real private transfer + withdrawal)
- [ ] `/app` **Dynamic** connect + **Deploy** signature + the `unlink1…` identity
- [ ] **Fund** on Arc, then **`npm run circle:pay`** settling live (Circle micro-settlement)
- [ ] `my-bot.ts` private transfers + dashboard **Refresh**; (optional) `my-bot-2.ts` second wallet
- [ ] Architecture diagram on screen + GitHub URL
- [ ] Say the three names explicitly: **Dynamic · Unlink · Circle/Arc**
