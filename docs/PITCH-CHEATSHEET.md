# Shade — pitch cheat sheet (read right before)

## In 5 bullets
1. **Problem** — agents pay for data in on-chain nanopayments → fully public → a competitor reconstructs their oracles, budget, and **strategy**.
2. **Solution** — the **same agent, two rails**. Transparent (Circle x402) → the spy reconstructs everything. Private (Unlink) → the spy sees only noise. The contrast **is** the pitch.
3. **Three integrations** — **Dynamic** (wallet + one signature that *seeds* the identity), **Unlink** (private pool + ZK transfers), **Circle/Arc** (gas-free sub-cent USDC settlement).
4. **1 wallet = 1 bot** — the identity is derived **deterministically** from the wallet signature (RFC 6979) → no variable = a single identity, identical across dashboard + SDK + backend.
5. **Bring-your-own-bot** — any user plugs in their bot with a **signature proof (ShadeSig)** → an Unlink token **scoped to their address**, **no admin key**, **no DB** (stateless, re-derivable).

## Flow + what is public/private
```
 Connect ──► Deploy ──────► Fund ──────► Run bot ─────────► Withdraw
 Dynamic    sign → Unlink   deposit      pay oracles         pool → fresh addr
 (wallet    identity        [PUBLIC]     [PRIVATE: ZK]       [PUBLIC but
  access)   (1 wallet=1bot)                                   decorrelated]
```

## Two rails (the money shot)
```
                     SAME  AGENT
                    /            \
        TRANSPARENT (x402)        PRIVATE (Unlink)
        Circle settles            shielded pool
              │                          │
        spy reconstructs:          spy sees:
          funder       ✅             funder       🚫
          oracles      ✅             oracles      🚫
          budget       ✅             budget       🚫
          DeFi trades  ✅             DeFi trades  🚫  (run via fresh ExecutionAccounts)
          strategy     ✅             strategy     🚫
```
The agent doesn't just *pay for signals* — it **acts on them**: after the ticks it
allocates capital into a **yield vault, a DEX swap, and a lending supply**. Transparent
rail → the spy adds "deploys capital into …" to the leak. Private rail → the same three
allocations run through Unlink `execute()` and leave **no agent→venue edge** on-chain.

## What "invisible" means (don't overclaim)
Shade does **not** erase the DeFi transaction from the chain. The deposit/swap/supply
still executes on-chain — through an **ephemeral ExecutionAccount** (real UserOp, gas
sponsored). What's hidden is the **link**, three ways:
1. **identity ↔ action** — the ExecutionAccount can't be tied to your agent or its pool.
2. **action ↔ action** — each uses a **fresh** account, so the swap, the deposit and the
   supply can't even be linked to each other.
3. **signals ↔ execution** — the "reads ETH/BTC → deploys into vault+swap+lending" graph
   is unreconstructable.
One line: *"Shade doesn't hide that a deposit happened somewhere; it breaks the link
between your identity, your signals, and your executions."*

## Who does what (the 3 SDKs)
```
 Dynamic ─ signs ─► derive-seed message ─► Unlink identity   (1 signature, no popup after)
 Unlink  ─ pool  ─► private transfers     (ZK proof + nullifier + relayer)
 Circle  ─ x402  ─► gas-free USDC settle on Arc   (0.001 USDC, batched)
```

## Bring-your-own-bot (auth, no admin key)
```
   Bot (its wallet key)                Your backend               Unlink
   ────────────────────                ────────────               ──────
   ShadeSig =                          re-derives the address
   [ identity sig + timestamped sig ] ─► from the signature ─► issues SCOPED token
                                       (admin key HERE,            to that address
                                        never on the bot)
```

## Inside the Unlink pool (if pushed on the crypto)
```
 deposit  ► encrypted note added to a Merkle tree            [PUBLIC]
 transfer ► ZK proof: "I spend a valid note"
            + nullifier (no double-spend, without saying which)
            + relayer broadcast                              [PRIVATE]
 owner    ► viewing key decrypts YOUR notes → your balance
 withdraw ► out to an address → decorrelated from the deposit [PUBLIC]
```

## One-liners to land
- *"The derivation is Unlink's primitive — I don't reinvent the crypto. My work is wiring Dynamic's signature as the seed, making it consistent across surfaces, and adding stateless per-user auth."*
- *"Dynamic signs once (the derive-seed message); after that the derived Unlink key signs every payment — no popup."*
- *"What's hidden: who funds it, which oracles, amounts, frequency, strategy — and now the capital allocation too: the vault deposits, swaps and lending supplies run through fresh ExecutionAccounts, with no link back to the agent."*
- *"The DeFi action still lands on-chain; what disappears is the link between the agent, its signals and its trades. We hide the actor and the playbook, not the existence of a tx."*
- *"Circle settles 0.001 USDC gas-free on Arc — real sub-cent micro-settlement, not one big transfer."*
