"use client";

import { useWallet } from "../../lib/wallet-context";
import type { AgentTurn } from "./chat-types";
import { formatBillable, sumChatPayments } from "./chat-types";

type Props = {
  turns: AgentTurn[];
  activeTurnId: string | null;
};

export default function AgentStepsSidebar({ turns, activeTurnId }: Props) {
  const wallet = useWallet();
  const active = turns.find((t) => t.id === activeTurnId) ?? turns[turns.length - 1];
  const chatPayment = sumChatPayments(turns);
  const pendingBillable =
    chatPayment !== null && BigInt(chatPayment.sessionBillable) > BigInt(0);
  const showPendingFooter = wallet.sessionOpen && pendingBillable;
  const settlement = wallet.lastSettlement;

  return (
    <aside className="chat-sidebar" aria-label="Agent steps">
      <header className="steps-header">
        <span className="eyebrow">Live trace</span>
        <h2 className="steps-heading">Agent steps</h2>
      </header>

      {!active ? (
        <div className="steps-empty">
          <p>Agent steps will appear here after you send a message.</p>
        </div>
      ) : (
        <div className="steps-body">
          <p className="steps-user">{active.userMessage}</p>

          <ol className="steps-list">
            {active.loading ? (
              <li className="step step-loading">
                <span className="step-dot" />
                <div>
                  <strong>Running metered tools…</strong>
                  <span className="step-detail">Multi-provider calls — settle when done</span>
                </div>
              </li>
            ) : (
              active.steps.map((step, i) => (
                <li
                  key={i}
                  className={`step step-${step.kind}${step.kind === "tool_call" && step.served === false ? " step-failed" : ""}`}
                >
                  <span className="step-dot" />
                  <div>
                    <strong>{step.label}</strong>
                    {(step.kind === "gateway" || step.kind === "provider") && step.detail && (
                      <span className="step-detail">{step.detail}</span>
                    )}
                    {step.kind === "tool_call" && (
                      <>
                        <span className="step-meta">
                          {step.providerId ?? step.tool} · metered
                        </span>
                        {step.args && Object.keys(step.args).length > 0 && (
                          <code className="step-args">{JSON.stringify(step.args)}</code>
                        )}
                        {step.detail && <span className="step-detail">{step.detail}</span>}
                      </>
                    )}
                    {step.kind === "answer" && step.detail && (
                      <span className="step-detail">{step.detail}</span>
                    )}
                    {(step.kind === "provider_settlement" || step.kind === "payment") && step.detail && (
                      <span className="step-detail step-payment-detail">{step.detail}</span>
                    )}
                    {step.kind === "payment_total" && step.detail && (
                      <span className="step-detail step-payment-total">{step.detail}</span>
                    )}
                  </div>
                </li>
              ))
            )}
          </ol>
        </div>
      )}

      {settlement && (
        <footer className="steps-footer steps-footer-settled">
          <strong>Settled on-chain</strong>
          <div className="steps-footer-row">
            <span>Paid to provider</span>
            <span>{formatBillable(settlement.settledAmount, settlement.tokenSymbol)}</span>
          </div>
          <div className="steps-footer-row">
            <span>Refunded from escrow</span>
            <span>{formatBillable(settlement.refundedAmount, settlement.tokenSymbol)}</span>
          </div>
          <div className="steps-footer-row steps-footer-total">
            <span>{settlement.sessionCalls} metered call(s)</span>
            <span>{formatBillable(settlement.sessionBillable, settlement.tokenSymbol)}</span>
          </div>
          <a
            className="steps-settle-link"
            href={settlement.explorerUrl}
            target="_blank"
            rel="noreferrer"
          >
            View settle tx
          </a>
        </footer>
      )}

      {showPendingFooter && chatPayment && (
        <footer className="steps-footer">
          <strong>Pending settlement</strong>
          {chatPayment.providers.map((p) => (
            <div key={p.providerId} className="steps-footer-row">
              <span>{p.providerLabel}</span>
              <span>
                {p.turnCalls} call(s) · {formatBillable(p.turnBillable, chatPayment.tokenSymbol)}
              </span>
            </div>
          ))}
          <div className="steps-footer-row steps-footer-total">
            <span>Accrued this session</span>
            <span>
              {chatPayment.sessionCalls} call(s) ·{" "}
              {formatBillable(chatPayment.sessionBillable, chatPayment.tokenSymbol)}
            </span>
          </div>
          <button
            type="button"
            className="steps-settle-btn"
            disabled={wallet.settling}
            onClick={() => {
              void wallet.settleSession().catch(() => undefined);
            }}
          >
            {wallet.settling ? "Settling on-chain…" : "Settle on-chain"}
          </button>
          {wallet.error && <p className="steps-footer-note">{wallet.error}</p>}
        </footer>
      )}
    </aside>
  );
}
