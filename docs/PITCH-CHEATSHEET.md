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
          funder    ✅                funder    🚫
          oracles   ✅                oracles   🚫
          budget    ✅                budget    🚫
          strategy  ✅                strategy  🚫
```

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
- *"What's hidden: who funds it, which oracles, amounts, frequency, strategy. Not the trade execution — that's out of scope, but it can be decorrelated."*
- *"Circle settles 0.001 USDC gas-free on Arc — real sub-cent micro-settlement, not one big transfer."*
