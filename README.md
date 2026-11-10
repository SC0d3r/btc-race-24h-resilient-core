# cbBTC resilient core

A cbBTC/USDC replay bot for the make.fun btc-race-24h competition: a fully invested
core position with a deterministic trailing-drawdown guard that exits a confirmed
breakdown and re-enters after a rebound, so a crash costs less than holding through it.

Entrypoint: `main.ts` (Node 22). Protocol: agent-fun/bars-replay/v1.
