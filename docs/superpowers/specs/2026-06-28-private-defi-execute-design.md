# Spec — DeFi privée sur EVM via Unlink `execute()`

> Date : 2026-06-28. Statut : validé (design approuvé, prêt pour le plan).
> Portée : tout ce qui reste dans l'EVM et rend un ERC-20 fongible redéposable
> dans la pool privée. Hors scope explicite : §10.

## 1. Modèle mental

Unlink expose `client.execute()` : on retire des fonds du solde privé vers un
**ExecutionAccount** (smart account ERC-4337 éphémère appartenant à l'user, gas
sponsorisé par le paymaster Unlink), ce compte exécute un batch d'appels EVM
arbitraires (`executeBatch(Call[])`, 1–16 calls), puis on rapatrie le résultat
dans le solde privé via `depositBack`.

Le protocole DeFi cible n'a **rien à intégrer**. Il voit l'ExecutionAccount comme
`msg.sender`. La confidentialité vient de ce que l'ExecutionAccount n'est reliable
ni à l'identité de l'user ni à sa pool.

**Invariant de privacy (à ne jamais casser) :** politique d'allocation `fresh`
(= un ExecutionAccount neuf par action atomique). Réutiliser un compte recrée un
graphe corrélable on-chain.

## 2. Prérequis tranchés (recherche doc + source SDK)

Deux inconnues bloquantes de la spec d'origine sont résolues :

### 2.1 `depositBack` est à **montant FIXE**, pas balance-based
La doc Unlink (`execute-advanced.md`) est explicite : *"Your batch must leave the
requested token and amount in the ExecutionAccount."* Conséquences :
- On ne peut **pas** « déposer tout le solde résultant ». Il faut un montant.
- → on calcule un **minOut prudent** via un `preview`/`quote` on-chain + marge de
  slippage (`preview.ts`), et on dépose ce minimum. Le reliquat (dust = sortie
  réelle − minOut) reste dans l'ExecutionAccount (balayage = hors scope).
- **Permit2 (confirmé contre le SDK `client-core`)** : le deposit-back est un
  **Permit2 SignatureTransfer** — le relayer *pull* le token depuis l'EA via
  `permitTransferFrom`. Le witness est **auto-pré-signé par le SDK** (hook
  `signingHooks.preSignPermit2DepositBack`, injecté automatiquement par
  `client.execute` session — on ne le passe pas). Le batch n'a donc besoin que
  d'**UNE** allowance ERC-20 : `approve(PERMIT2_ADDRESS, resultToken, max)`.
  Pas de couche `Permit2.approve` interne (SignatureTransfer ≠ AllowanceTransfer).
  L'EA étant `fresh`, il n'a jamais approuvé Permit2 → ce call est obligatoire.
  `PERMIT2_ADDRESS = 0x000000000022D473030F116dDEE9F6B43aC78BA3` (même sur toutes
  les chaînes EVM). Batch = 3 calls par primitive (approve action + action +
  approve Permit2) → marge confortable vs le plafond de 16.

Formes SDK confirmées (`client-core-fx4pyG3H.d.ts`) :
- `DepositBackParams = { token: string; amount: string; nonce: string; deadline: number }`.
- `ExecuteCall = { target: string; value: "0"; data: string; label?: string }`
  (le SDK *strip* le `label` avant l'envoi : usage logs côté client uniquement).
- `client.execute(SessionExecuteParams)` = `Omit<ExecuteParams, "signSigningRequest" | "signingHooks">`
  → on passe `{ token, amount, calls, depositBack?, allocationPolicy?, accountIndex? }`.
- `executeBatch` (Solady) est **atomique** : tout revert interne annule l'UserOp.

`client.execute()` — paramètres confirmés :
- requis : `token` (ERC-20 retiré), `amount` (base units), `calls` (1–16).
- optionnels : `depositBack { token, amount, nonce, deadline }`,
  `allocationPolicy` (défaut `first_unused`), `accountIndex` (requis si `by_index`).

`client.executionAccounts.reserve({ policy })` :
- `"fresh"` → `first_unused`
- `"reuseLatest"` → `most_recent_active`
- `{ accountIndex }` → `by_index`
- Métadonnées renvoyées : `account_id`, `account_index`, `account_address`,
  `owner_address`, `status`, etc.

### 2.2 Le bring-your-own-bot peut `execute()` — **pas de fork de compte**
La source du SDK (`account.fromEthereumSignature`) appelle `account.fromSeed` en
interne (`DerivedAccountProvider`, seed-backed). Le message d'erreur du SDK liste
`fromSeed | fromMnemonic | fromEthereumSignature | fromMetaMask` comme providers
valides pour `execute()`. **Seul `fromKeys` (StaticAccountProvider) ne peut pas**,
et Shade ne l'utilise nulle part.

Donc :
- CLI `src/unlink/node-client.ts` (`fromMnemonic`) → execute ✅
- Bot `src/sdk/index.ts` `ShadeAgent` (`fromEthereumSignature`) → execute ✅
- Identité « 1 wallet = 1 bot » **inchangée**, aucune migration.

Réserve à vérifier au runtime : que `execute()` fonctionne en **mode remote
(apiUrl)** comme `transfer`/`withdraw` (même schéma d'auth ShadeSig). Architecture
identique → attendu OK, à confirmer à l'exécution.

## 3. Les 3 primitives (scope « propre »)

| Primitive    | Batch `execute()`                                   | Position rendue | depositBack |
| ------------ | --------------------------------------------------- | --------------- | ----------- |
| `swap`       | `[approve(router), exactInputSingle(recipient=EA)]` | token de sortie | oui         |
| `vault4626`  | `[approve(vault), deposit(assets, EA)]`             | shares ERC-20   | oui         |
| `aaveSupply` | `[approve(pool), supply(asset, amt, EA, 0)]`        | aTokens ERC-20  | oui         |

`EA` = ExecutionAccount réservé. Chaque batch ajoute aussi
`approve(Permit2, resultToken)` avant le deposit-back (§2.1). Les 3 rendent un
ERC-20 fongible → redéposable dans la pool. C'est le critère du scope.

## 4. Interfaces (`src/defi/types.ts`)

```ts
import type { PublicClient } from "viem";

export type PrimitiveKind = "swap" | "vault4626" | "aaveSupply";

export interface EvmCall {
  target: `0x${string}`;
  value: "0";                 // toujours "0" ; ETH natif → passer par WETH
  data: `0x${string}`;        // encodeFunctionData(...)
  label: string;              // suivi/logs Unlink
}

export interface BuildContext {
  execAccount: `0x${string}`; // recipient = ExecutionAccount réservé
  token: `0x${string}`;       // token d'entrée retiré du solde privé
  amount: bigint;             // base units
  slippageBps: number;        // SOURCE UNIQUE de la marge (voir précédence ci-dessous)
  minOut: bigint;             // calculé par previewMin AVANT buildCalls (résout l'ordre circulaire)
}

export interface PrimitiveAdapter<Cfg> {
  kind: PrimitiveKind;
  /** montant prudent (preview on-chain + slippage). Appelé EN PREMIER par le runner. */
  previewMin(cfg: Cfg, ctx: Omit<BuildContext, "minOut">, publicClient: PublicClient): Promise<bigint>;
  /** batch ordonné pour execute() (approves + action recipient=EA + approve Permit2 resultToken).
   *  Utilise ctx.minOut pour amountOutMinimum (swap). Synchrone : tout est déjà connu. */
  buildCalls(cfg: Cfg, ctx: BuildContext): EvmCall[];
  /** adresse du token résultat redéposable */
  resultToken(cfg: Cfg, ctx: BuildContext): `0x${string}`;
}
```

**Ordre imposé (résout l'issue circulaire) :** le runner appelle `previewMin`
d'abord, injecte `minOut` dans `BuildContext`, puis `buildCalls`. Ainsi le swap
peut poser `amountOutMinimum = ctx.minOut`, et c'est **le même `minOut`** qui sert
de `depositBack.amount` → garantit `amountOutMinimum ≥ depositBack.amount`, donc
le deposit-back ne peut pas échouer pour cause de sortie insuffisante.

**Précédence du slippage :** `ctx.slippageBps` (options du run) est la **seule
source**. Les configs par primitive ne portent **pas** de `slippageBps`. Le runner
applique un défaut (50 bps) et **rejette `slippageBps === 0` hors mode démo
explicite** (`allowZeroSlippage`).

**Résolution `kind → adapter` :** `registry.ts` renvoie `{ kind, cfg }` ; un map
`ADAPTERS: Record<PrimitiveKind, PrimitiveAdapter<any>>` (dans `run.ts` ou
`registry.ts`) résout l'instance d'adapter à partir de `kind`. Le runner ne reçoit
donc qu'un `registryId`.

Une config par protocole, pas un fichier. `registry.ts` mappe un id lisible
(`"uniswap-v3-usdc-weth"`) → `{ kind, cfg }`, donnant l'illusion « par protocole »
côté UI/démo tout en gardant un seul adapter par primitive.

## 5. Runner unique (`src/defi/run.ts`)

```ts
async function runPrivateDefi(client, publicClient, registryId, {
  token, amount, slippageBps = 50, allowZeroSlippage = false,
}) {
  if (slippageBps === 0 && !allowZeroSlippage) {
    throw new Error("slippageBps=0 interdit hors mode démo (allowZeroSlippage)");
  }
  const { kind, cfg } = registry[registryId];
  const adapter = ADAPTERS[kind];

  // 1. réserver FRESH (invariant privacy)
  const exec = await client.executionAccounts.reserve({ policy: "fresh" });
  const base = { execAccount: exec.account_address, token, amount, slippageBps };

  // 2. preview D'ABORD (résout l'ordre circulaire) — peut throw (quoter revert,
  //    pool absente, liquidité fine). Aucun fonds retiré à ce stade : safe.
  const minOut = await adapter.previewMin(cfg, base, publicClient);
  const ctx = { ...base, minOut };

  // 3. batch (utilise ctx.minOut pour amountOutMinimum)
  const calls = adapter.buildCalls(cfg, ctx);

  // 4. execute : by_index pour cibler le MÊME compte que celui réservé.
  //    Atomique : si le batch revert, depositBack n'a pas lieu. Voir gestion d'erreur.
  try {
    const result = await client.execute({
      token,
      amount: amount.toString(),
      calls,
      depositBack: {
        token: adapter.resultToken(cfg, ctx),
        amount: minOut.toString(),
        nonce: randomU128Decimal(),                 // nonce Permit2 non-ordonné, u128
        deadline: Math.floor(Date.now() / 1000) + 3600,
      },
      allocationPolicy: "by_index",
      accountIndex: exec.account_index,
    });
    return { result, exec, minOut };
  } catch (err) {
    // Le batch a revert OU le depositBack a échoué. Surface l'erreur + l'adresse
    // de l'ExecutionAccount réservé pour récupération manuelle (le balayage du
    // reliquat est hors scope §10). On NE réutilise PAS ce compte fresh.
    throw new DefiExecuteError(err, { execAccount: exec.account_address, registryId });
  }
}
```

Décision clé : **`by_index` avec `exec.account_index`** pour garantir que le compte
recipient des `buildCalls` est exactement celui d'où `execute` retire les fonds.
(Sinon `first_unused` pourrait théoriquement diverger du compte réservé.)

**Gestion d'erreur & fonds (issue reviewer #3).** `execute()` est atomique côté
batch : un revert on-chain n'ouvre pas la position et ne fait pas le deposit-back.
**À vérifier au runtime (bloquant avant usage réel) :** quand le batch ou le
deposit-back échoue, est-ce que le retrait initial (token → ExecutionAccount) est
*rollback* (fonds rendus au solde privé) ou est-ce que les fonds restent **bloqués
dans l'ExecutionAccount fresh** (non réutilisable) ? Selon la réponse Unlink, soit
on ne fait rien (rollback natif), soit le runner doit exposer l'adresse + un
chemin de récupération. Tant que ce n'est pas confirmé, ne pas brancher sur des
montants réels non-testnet. Le runner enveloppe tout dans `try/catch` et propage
`DefiExecuteError { execAccount, registryId }`.

**Dérive preview→execution (issue #4).** Le `minOut` est lu au build ; entre le
build et l'inclusion on-chain, le ratio share/asset (vault) peut baisser (yield).
La marge `slippageBps` doit couvrir cette dérive. Pour `aaveSupply`, le ratio est
≈1:1 mais **ne pas hard-zéro** le slippage. Si la sortie réelle < `depositBack.
amount`, le deposit-back échoue *après* ouverture de position (pire cas) → c'est
exactement ce que la marge protège.

`randomU128Decimal()` : nonce Permit2 non-ordonné (u128 aléatoire, décimal). À
confirmer contre le SDK que c'est le format attendu pour `depositBack.nonce`.

## 6. Déviations par protocole (gérées en config, pas en réécrivant l'adapter)

### swap
- **Uniswap v3** : `ISwapRouter.exactInputSingle({ tokenIn, tokenOut, fee,
  recipient: EA, amountIn, amountOutMinimum, sqrtPriceLimitX96: 0 })`.
- `previewMin` : `QuoterV2.quoteExactInputSingle` → appliquer `ctx.slippageBps`.
- `amountOutMinimum = ctx.minOut` (= `depositBack.amount`). Garde `slippageBps=0`
  au niveau runner (§5), pas dans l'adapter.
- Config : `{ router, quoter, tokenOut, fee }`. *(Pas de `slippageBps` : source
  unique = `ctx`.)*
- v4 / Universal Router (commands encodées) = **hors scope** de cette itération.

### vault4626
- `deposit(uint256 assets, address receiver=EA)` ; sortie via
  `redeem(shares, EA, EA)` (évite le dust ; non requis dans ce scope d'entrée).
- `previewMin` : `previewDeposit(assets)` → appliquer `ctx.slippageBps` (la marge
  doit couvrir la dérive preview→execution, cf §5).
- **Dead-deposit / inflation** : vault sain a un dépôt mort (≥1e9/1e12 selon
  décimales). Vérifier en « prod » (pas bloquant en démo).
- **Gate (Morpho Vault V2 `canReceiveShares`, KYC)** : un ExecutionAccount
  éphémère **sera rejeté**. Config `requiresUngatedVault: true` → ne proposer que
  des vaults sans gate. Couvre Yearn / Pendle SY / Aave Earn (tous 4626).
  **Pré-flight runtime (issue #5)** : `previewMin` (ou un check dédié) sonde
  `maxDeposit(EA) > 0` (et `canReceiveShares(EA)` si exposé) et **throw clair**
  avant l'`execute` si le vault est gaté — évite un revert opaque on-chain après
  retrait des fonds.
- Config : `{ vault, asset, requiresUngatedVault }`. *(Pas de `slippageBps`.)*

### aaveSupply
- `Pool.supply(asset, amount, onBehalfOf=EA, referralCode=0)`.
- aTokens rebasing : pour tout retirer plus tard, `withdraw(asset,
  type(uint256).max, to)` (pas de dust). Le retrait est hors scope d'entrée ici.
- `previewMin` : ratio 1:1 asset↔aToken au dépôt → `amount` moins `ctx.slippageBps`
  (petit, mais **ne pas hard-zéro** : couvre les arrondis / dérive — issue #4).
- **borrow = hors scope** (VariableDebtToken non-transférable, position
  persistante, corrélation inévitable).
- Config : `{ pool, asset }`.

## 7. Cible de test E2E

Un vrai vault ERC-4626 *sans gate* déployé sur **arc-testnet** (chainId 5042002,
gas USDC) est incertain (L1 Circle récente, peu de DeFi tierce). Pour un E2E
**déterministe** :
- Déployer un **mock OZ ERC-4626 minimal** (wrappe le test-token, sans gate,
  dead-deposit seedé) sur le testnet actif → cible fiable pour `vault4626`.
- `swap` / `aaveSupply` : tester contre de vrais déploiements sur **base-sepolia**
  s'ils existent (Uniswap v3, Aave v3) ; sinon mock. Documenter ce qui est mocké.

⚠️ **Risque principal** assumé : l'E2E « vendeur » (cacher une vraie stratégie de
yield sur un protocole réel) dépend de la disponibilité d'un déploiement tiers ;
le mock prouve la mécanique Unlink (reserve→execute→depositBack) sans le prouver
contre un protocole de production.

## 8. Intégration Shade

- Réutiliser le client Unlink existant. Nouveauté = `execute()` +
  `executionAccounts.reserve()`, pas un nouveau client. Branchable sur le CLI
  (`createNodeUnlinkContext`) et sur `ShadeAgent` (ajouter une méthode, ex.
  `agent.runDefi(registryId, amountHuman, { slippageBps })`).
- `/spy` : une action DeFi privée doit apparaître côté **rail privé** comme du
  bruit (un ExecutionAccount fresh non corrélé), comme les paiements oracle. Le
  rail transparent montrerait l'agent appelant Uniswap/Aave en clair.
- Bring-your-own-bot : marche aussi en mode remote (auth ShadeSig scoped), à
  confirmer au runtime (§2.2).

## 9. Checklist de revue (« ça marche »)

- [ ] Politique `fresh` partout sur les actions atomiques (invariant privacy).
- [ ] `depositBack` récupère le token résultat (montant via preview+slippage §2.1).
- [ ] Slippage non nul en usage réel (swap + vault).
- [ ] Vault 4626 : dead-deposit présent + pas de gate (`requiresUngatedVault`).
- [ ] Client seed-backed (sinon `execute` impossible) — vérifié, OK pour les deux
      chemins Shade.
- [ ] `/spy` rail privé : aucun lien Exec↔identité.
- [ ] Les 3 adapters + entrées registry compilent (typecheck / `npm run build`).
- [ ] ≥1 primitive (`vault4626`) testée E2E sur testnet
      (reserve → execute → depositBack).

## 10. Hors scope (explicite)

- Aave/Morpho **borrow** (dette non-tokenisée, corrélation forcée).
- **Hyperliquid / dYdX** et perps à état hors-EVM (pas d'ERC-20, pas de
  depositBack).
- **GMX** (perp on-chain, position persistante type Aave-borrow) — plus tard.
- **Uniswap v4 / Universal Router** (commands encodées) — après que v3 marche.
- Gestion fine du **dust** / balayage des reliquats d'ExecutionAccount.

## 11. Arborescence cible

```
src/defi/
  types.ts            # PrimitiveKind, EvmCall, BuildContext, PrimitiveAdapter
  run.ts              # runPrivateDefi() — reserve fresh + execute + depositBack (by_index)
  preview.ts         # quotes/previewDeposit → minOut avec slippage
  primitives/
    swap.ts           # Uniswap v3 (cfg: router, quoter, tokenOut, fee)
    vault4626.ts      # 4626 (cfg: vault, asset, requiresUngatedVault)
    aaveSupply.ts     # Aave (cfg: pool, asset)
  registry.ts         # id lisible → { kind, cfg } + ADAPTERS: kind → adapter
  errors.ts           # DefiExecuteError { execAccount, registryId }
```

`slippageBps` n'est jamais dans une config de primitive : source unique =
`ctx.slippageBps` (options du run), défaut 50 bps, garde `=0` au runner.
