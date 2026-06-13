# Shade — Architecture

> Private nano-payment agent. An agent's **funding** (by its owner) and **spending**
> (per API call) are unreadable on-chain — where bare x402 exposes the agent's
> strategy, budget and funder to anyone reading the chain.
>
> Combines the three required SDKs: **Dynamic** (onboarding/wallet) · **Unlink**
> (private accounts) · **Circle Nanopayments** (x402 settlement). Runs on **Arc Testnet**.

---

## 1. The thesis in one picture

The same agent does the same thing on two rails. The only difference is **what a
competitor reading the chain can reconstruct**.

```mermaid
flowchart LR
  subgraph LEFT["LEFT — x402 nu (transparent)"]
    direction TB
    O1[Owner wallet] -->|funds, visible| A1[Agent EOA]
    A1 -->|pays per call, visible| E1[ETH oracle]
    A1 -->|pays per call, visible| B1[BTC oracle]
    SPY1[🕵️ Spy indexer] -.reads chain.-> A1
    SPY1 -.->|reconstructs| R1["funder ✅<br/>oracles ✅<br/>budget ✅<br/>strategy ✅"]
  end

  subgraph RIGHT["RIGHT — same agent on Unlink (private)"]
    direction TB
    O2[Owner wallet] -->|deposit into pool| P2[(Unlink privacy pool)]
    P2 --> A2[Agent shielded account]
    A2 -.private transfer.-> E2[ETH oracle]
    A2 -.private transfer.-> B2[BTC oracle]
    SPY2[🕵️ Spy indexer] -.reads chain.-> P2
    SPY2 -.->|reconstructs| R2["funder 🚫<br/>oracles 🚫<br/>budget 🚫<br/>strategy 🚫"]
  end
```

The visual contrast **is** the pitch (the split-screen demo, étape 4).

---

## 2. System components

```mermaid
flowchart TB
  subgraph Browser["Browser (Next.js app)"]
    UI["/flow page"]
    DYN["Dynamic SDK<br/>(wallet + onboarding)"]
    BUC["Unlink browser client<br/>src/unlink/browser-client.ts"]
    UI --> DYN
    UI --> BUC
  end

  subgraph Backend["Next.js API routes (server)"]
    REG["/api/unlink/register"]
    AUTH["/api/unlink/authorization-token"]
    SELL["/api/oracle/sellers"]
    X402["/api/x402/{eth,btc}<br/>Circle-protected oracles"]
    ADM["Unlink admin<br/>src/unlink/auth-routes.ts"]
    CIR["Circle seller<br/>src/circle/with-gateway.ts"]
    REG --> ADM
    AUTH --> ADM
    X402 --> CIR
  end

  subgraph Agents["Agents / scripts"]
    LOOP["agent loop<br/>src/agent/*"]
    MCP["MCP server<br/>src/mcp/server.ts"]
  end

  subgraph Spy["Spy engine (étape 4)"]
    REC["reconstruct()<br/>src/spy/reconstruct.ts"]
    CR["chain-reader<br/>src/spy/chain-reader.ts"]
    CR --> REC
  end

  subgraph Chain["Arc Testnet"]
    UNLINK[["Unlink engine + pool"]]
    CIRCLE[["Circle Gateway<br/>(x402 batched settlement)"]]
    USDC[["USDC 0x3600…0000"]]
  end

  BUC -->|register/tokens| REG
  BUC -->|register/tokens| AUTH
  BUC -->|deposit / transfer| UNLINK
  DYN -->|signs txs| USDC
  LOOP -->|transparent rail| CIRCLE
  LOOP -->|private rail| UNLINK
  MCP -->|private pay| UNLINK
  X402 --> CIRCLE
  CR -->|reads Transfer logs| USDC
```

---

## 3. Owner flow (sequence)

```mermaid
sequenceDiagram
  participant U as Owner
  participant App as /flow (browser)
  participant D as Dynamic
  participant API as Backend routes
  participant UN as Unlink engine (Arc)

  U->>App: open /flow
  App->>D: Connect
  D-->>App: wallet (Arc)
  U->>App: Deploy agent
  App->>D: signMessage(derive-seed)
  D-->>App: signature
  App->>App: account.fromEthereumSignature
  App->>API: POST /api/unlink/register
  API->>UN: admin.users.register
  U->>App: Fund (e.g. 2 USDC)
  App->>UN: depositWithApproval (wallet signs)
  U->>App: Run agent
  loop each tick
    App->>API: GET /api/oracle/sellers
    App->>UN: transfer → ETH oracle (private)
    App->>UN: transfer → BTC oracle (private)
    App->>App: decide(ETH, BTC) → BUY/SELL/HOLD
  end
```

---

## 4. SDK mapping (by necessity, not box-ticking)

| Step | SDK | Call |
|------|-----|------|
| Owner onboarding + wallet | **Dynamic** | embedded wallet, signs |
| Derive agent's private identity | **Unlink** | `account.fromEthereumSignature` |
| Budget → private agent account | **Unlink** | `depositWithApproval()` |
| Agent pays each oracle (private rail) | **Unlink** | `transfer()` |
| Settlement / transparent rail | **Circle Nanopayments** | x402 v2 + EIP-3009 (`GatewayClient` / `BatchFacilitatorClient`) |
| Withdraw | **Unlink** | `withdraw()` |
| Plug in any external agent | **MCP** | `pay_oracle` tool → Unlink |

---

## 5. "Plug in your agent" (MCP)

```mermaid
flowchart LR
  AGENT["Any MCP agent<br/>(Claude Desktop, Cursor, Agent SDK)"]
  MCP["Shade MCP server<br/>list_oracles · pay_oracle"]
  UN[["Unlink (private)"]]
  ORA["Oracle / API"]
  AGENT -->|callTool pay_oracle| MCP
  MCP -->|private transfer| UN
  UN --> ORA
  MCP -->|data| AGENT
```

- **Demo**: shared budget — any agent plugs in with zero config.
- **Prod**: per-user — the user funds their own Unlink account (auth layer).

---

## 6. Networks & assets

- **Chain**: Arc Testnet (`eip155:5042002`), gas paid in USDC. Base Sepolia kept as a
  configurable fallback (`UNLINK_ENVIRONMENT`).
- **Asset**: USDC `0x3600000000000000000000000000000000000000` — one asset for both rails.
- **Circle facilitator**: `https://gateway-api-testnet.circle.com` (testnet).

## 7. What's judged vs out of scope

- **Judged**: the *private payment* for agent data (Unlink + Circle + Dynamic combined).
- **Out of scope (YAGNI)**: real DEX execution, smart-contract-enforced allowance
  (shown in UI only), multi-agent, prod auth for per-user MCP.
