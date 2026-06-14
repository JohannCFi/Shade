# Shade — technical pitch FAQ

One-page cheat sheet of likely judge/sponsor questions and tight, honest answers.
Read it right before pitching to **Arc · Unlink · Dynamic**.

---

## 30-second framing

Shade makes an autonomous agent's **nanopayments private**. The same agent runs on
two rails — transparent (Circle x402) vs private (Unlink) — and a spy indexer
reconstructs the transparent one fully while seeing only noise on the private one.
**Dynamic** = wallet + identity, **Unlink** = private accounts + routing, **Circle on
Arc** = gas-free sub-cent USDC settlement.

---

## Architecture & "their SDK vs your code"

**Q: What did you actually build vs. what's just the SDKs?**
The crypto is theirs; the system is mine. The **shielded-account derivation is
Unlink's primitive** (`account.fromEthereumSignature`) — I don't reinvent it. My
implementation is: wiring **Dynamic's wallet signature** as the seed, making that
derivation **identical across the browser, the bot SDK, and the backend**, and a
**per-user auth layer** so any external bot can pay privately **without ever holding
the admin key**.

**Q: Is there a backend? Is it deployed?**
Yes — Next.js API routes (oracles, x402, Unlink auth, the spy reader). Deployed on
Vercel, usable by judges. Stateless (no database).

---

## Identity derivation (the core mechanism)

**Q: How exactly is the agent's identity derived?**
Two steps: (1) the wallet signs a canonical message
`buildDeriveSeedMessage({ appId, chainId })`; (2) that ECDSA signature seeds an Unlink
account via `account.fromEthereumSignature(...)`. So **wallet signature → private
Unlink identity**.

**Q: Why is it "1 wallet = 1 bot"? How do the browser and the bot reach the same
identity without talking to each other?**
Because `personal_sign` is **deterministic** (RFC 6979): the same key + same message
always yields the same signature → the same Unlink account. The dashboard, the SDK,
and the backend all derive it independently and land on the same `unlink1…`.

**Q: Could one wallet have several bots?**
Today no — one wallet maps to one identity. Adding a label/index into the signed
message would give `(wallet, label)` → multiple isolated bots. Additive, not built yet.

---

## Dynamic

**Q: How do you use Dynamic?**
Embedded/connected wallet for onboarding (no seed phrase). The wallet signs the
**one** derive-seed message that becomes the private identity, plus the on-chain
deposit/withdraw. Per-payment private transfers need **no popup** — the derived Unlink
account signs them.

**Q: Embedded wallets or server wallets?** *(expect this one)*
Embedded wallets for the user-driven flow. For a **headless autonomous bot**, today I
use the wallet's own self-custody key. **The clean next step is Dynamic server wallets
with delegated access** so an agent signs without holding the key in plaintext — that's
exactly the fit for autonomous agents and it's on the roadmap.

---

## Unlink

**Q: Show me a real private transfer / withdrawal.**
Every demo run makes real private transfers (the bots, the `/spy` private rail). The
"verify on engine" panel then shows each oracle **withdrawing** its received balance to
a public address — a real on-chain withdrawal that proves value moved **without
revealing the payer**.

**Q: What specifically is private?**
The funding source, which oracles the agent queries, the amounts, the frequency, the
budget, and the strategy those payments imply. What stays public (by design): that
*some* value entered/left the pool — never *who paid whom*.

**Q: Where does the admin key live? Isn't handing it to bots a problem?**
The Unlink admin key stays **server-side only**. Bots authenticate with a **stateless
wallet-signature proof (`ShadeSig`)**: two signatures (identity + freshness); the
backend re-derives the address, checks it, and issues an Unlink token **scoped to that
address only**. The bot never touches the admin key.

**Q: Can a bot get a token for someone else's account?**
No. The backend re-derives the address from the signature and rejects any mismatch; a
token authorizes API access but **cannot spend** (spending needs the account's spending
key, which only the owner holds).

---

## Circle & Arc

**Q: Show real gas-free micro-settlement, not one big transfer.**
`npm run circle:pay` settles a live payment: **0.001 USDC**, HTTP 402 → EIP-3009
authorization → Circle's `BatchFacilitatorClient` **verifies + settles in batches**,
gas-free. Sub-cent, on Arc testnet.

**Q: Why Arc?**
Gas is paid in USDC and settlement is high-throughput, so sub-cent payments make
economic sense — the rail where agent nanopayments are actually viable.

**Q: Where is Circle in the code?**
`src/circle/with-gateway.ts` (the x402 verify/settle wrapper), the Circle-gated oracle
routes `app/api/x402/{eth,btc}`, and `scripts/circle-pay.ts` (the live buyer).

---

## Security & scope (be honest first)

**Q: Replay protection?**
The `ShadeSig` freshness signature is timestamped with a one-sided ~120s window — fine
for testnet/MVP. A nonce/challenge store (e.g. Vercel KV) removes the window entirely;
noted as future hardening.

**Q: What's mocked / out of scope?**
Real DEX trade execution (Shade protects *paying for data + the strategy*, not order
execution); the nonce store above; headless bots for **embedded-wallet** users (they
can't export a key — self-custody only, an industry-wide custody constraint).

**Q: What's the killer demo in 20 seconds?**
`/spy` → Run agent live → left rail reconstructs the whole strategy, right rail stays
dark — same agent, identical activity, one is readable and one is invisible.
