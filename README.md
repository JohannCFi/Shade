# Shade — Private Nano-Payment Agent

> ETHGlobal New York 2026 — prize **"Best Private Nano Payment App"** (sponsor Unlink).
> Combine **Dynamic** (onboarding/wallet) + **Unlink** (comptes privés) + **Circle Nanopayments** (settlement x402 v2 / EIP-3009).

## Pitch

Un agent autonome dont le **financement** (par son owner) et les **dépenses** (par appel
d'API) sont totalement illisibles onchain — là où x402 nu expose la stratégie de l'agent,
son budget et son financeur à n'importe quel concurrent qui lit la chain.

## Démo (split-screen "vu par un concurrent")

- **Gauche — x402 nu (transparent)** : un panneau "espion" reconstruit en live la stratégie
  de l'agent (quels oracles, à quelle fréquence), son budget et le wallet qui l'a financé.
- **Droite — même agent sur Unlink** : le panneau espion n'affiche que du bruit.

Le contraste visuel **est** le pitch.

## Stack

- Next.js (front + routes API), déployable Vercel
- `@unlink-xyz/sdk` (comptes privés, base-sepolia)
- Dynamic SDK (onboarding owner)
- Circle Nanopayments (settlement x402 v2, EIP-3009)

## Ordre de build (anti-risque)

1. **Dérisquer Unlink** : hello-world `deposit → transfer → withdraw` sur base-sepolia. ⬅️ en cours
2. Boucle agent + endpoints x402 "oracle" (mockés) + settlement Circle
3. Onboarding Dynamic
4. **Split-screen espion** (le plus soigné — c'est lui qui gagne)

## Statut

🚧 En cours de build (hackathon). Voir les PRs pour le détail des étapes.
