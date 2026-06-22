# ShadowMeter — Demo UI (track T4)

A self-contained, dependency-free visualization of the ShadowMeter flow, built for the
2–3 minute hackathon demo video. **Just open `index.html` in a browser** — no build step,
no install (works offline).

## The three panes

| Pane | Shows |
| --- | --- |
| **Consumer agent** (off-chain) | API calls ticking up; cumulative vouchers being signed |
| **Provider agent** (off-chain) | Vouchers verified; running bill — **private**, gatekept ≤ escrow |
| **Stellar testnet** (public) | Stays **empty** during 7,431 calls, then shows **one** settlement on close |

The whole point is visual: the consumer's call counter races to 7,431 while the chain pane
sits still ("0 settlements"). On close, a single `close_channel` transaction appears —
settle **$14.862** to the provider, refund **$5.138** to the consumer — and the **🔑 view-key
reveal** shows the private values (7,431 calls, $0.002/call) that *never touched the chain*.

> **Punchline:** thousands of agent-to-agent transactions · one on-chain settlement · zero usage leaked.

## Status — Day-1 skeleton (mock data)

This is intentionally driven by a **mock simulation** (`<script>` at the bottom of
`index.html`). The numbers match the worked example and the circuit
(`rate 0.002`, `escrow 20`, `7431` calls → `14.862` settled, `5.138` refunded).

**Day-2 wiring (next):** replace the mock loop with the real agent harness —
- consumer/provider events come from `@shadowmeter/agent` (`MeteredChannel.meter()`),
- the settlement card is driven by the real `settlement_amount` / `nullifier` from
  `toCircuitInput()`,
- the chain pane reads the actual Soroban `close_channel` tx on testnet.

The mock is structured so each pane is fed by one function — swap the data source, keep the UI.

## Run

```bash
open demo/index.html        # macOS
xdg-open demo/index.html    # Linux
# or just drag it into a browser
```
