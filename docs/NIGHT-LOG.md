# Night log — 2026-06-13

Goal exécuté en autonomie : **faire marcher la plomberie de paiement agentique en LIVE sur Arc, headless, testée et mergée proprement.** ✅ Les 4 points sont faits et mergés dans `main`.

## ✅ Ce qui marche, vérifié EN LIVE sur Arc Testnet

| Point | Statut | Preuve |
|---|---|---|
| 1. Circle settlement live | ✅ | deposit 0.5 USDC → pay → **settled** 0.001 USDC (id `073c51b5…`), oracle data renvoyée |
| 2. Agent 2 rails live | ✅ | 2 ticks, 0.008 USDC : Circle settle chaque appel (tx ids) + Unlink paie chaque appel en privé ; stratégie → HOLD, BUY |
| 3. Routes auth Unlink | ✅ | `POST /api/unlink/authorization-token` → **token réel émis** par le moteur |
| 4. Squelette UI flow | ✅ | `/flow` : Connect Dynamic réel + Deploy/Fund/Run (stubs câblés) ; `/` et `/flow` → 200 |

Bonus validé : **Unlink marche sur Arc en USDC** (le pool accepte l'USDC) → **chain unique (Arc) + asset unique (USDC) pour les 2 rails.**

## Décisions clés prises
- **Tout unifié sur Arc Testnet** (chain 5042002) pour viser la track Arc + Circle natif. base-sepolia gardé en fallback (flip via `UNLINK_ENVIRONMENT`).
- Circle : **facilitator testnet** `gateway-api-testnet.circle.com` (le défaut mainnet ne connaît pas Arc testnet).
- Unlink : **clé API par environnement** (Arc = `MCzBSf8Z…`), sinon "tenant not provisioned".

## Comment relancer (serveur Next requis pour Circle)
```bash
npm run build && PORT=3210 npm run start      # serveur
npm run circle:pay                            # un nano-paiement Circle live
npm run agent:run -- --rail both --ticks 2 --limit 0.05   # agent 2 rails (cap 0.05 USDC)
npm run derisk:unlink                         # deposit→transfer→withdraw Unlink (Arc)
npm test                                      # 30/30 unit tests
```

## Dépenses de la nuit (testnet)
~0.5 USDC déposé dans Gateway + ~0.012 USDC de paiements/dépôts Unlink. Wallet `0xD1e1…4089` largement fundé (avait 20 USDC).

## Reste à faire (avec toi)
1. **Étape 3 — brancher le vrai flow** (le `/flow` est un squelette) : Connect Dynamic → register Unlink **browser** → deposit USDC (fund) → lancer l'agent. Wiring du JWT Dynamic dans `src/unlink/auth-routes.ts` (stubs + TODO en place).
2. **Étape 4 — split-screen espion** (la viz qui gagne) : indexer les paiements Circle (visibles) vs Unlink (rien) et afficher le contraste. Les `observable` sont déjà dans les `PaymentReceipt`.
3. Livrables prize : diagramme d'archi, vidéo démo, doc.

## Note honnête / simplification
- Le rail Unlink de `agent-run.ts` fait un **deposit frais** avant les transfers (la balance shielded affichée peut être en retard après un withdraw → notes dépensables non garanties). À affiner.
- La donnée oracle du rail Unlink est lue du feed local après le paiement privé ; pour la démo on pourra gater l'HTTP par preuve Unlink (le paywall l'accepte déjà, cf. étape 2c).
