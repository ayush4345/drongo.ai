"use client";

import type { AgentTurn, SettleOutcome, SettlePhase } from "./chat-types";
import { formatBillable, sumChatPayments, SETTLE_STAGES } from "./chat-types";

type Props = {
  turns: AgentTurn[];
  activeTurnId: string | null;
  settlePhase: SettlePhase;
  settleStage: number;
  settleOutcome: SettleOutcome | null;
  settleError: string | null;
  settleErrorAction: "settle" | "open" | null;
  onSettle: () => void;
  onNewSession: () => void;
};

export default function AgentStepsSidebar({
  turns,
  activeTurnId,
  settlePhase,
  settleStage,
  settleOutcome,
  settleError,
  settleErrorAction,
  onSettle,
  onNewSession,
}: Props) {
  const active = turns.find((t) => t.id === activeTurnId) ?? turns[turns.length - 1];
  const chatPayment = sumChatPayments(turns);
  const showChatTotal = turns.filter((t) => t.payment && !t.loading).length > 1;
  const hasBillable = (chatPayment?.sessionCalls ?? 0) > 0;

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
                  <span className="step-detail">Multi-provider calls — settlement at end</span>
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

      {showChatTotal && chatPayment && chatPayment.sessionCalls > 0 && (
        <div className="steps-total">
          <strong>Chat total</strong>
          {chatPayment.providers.map((p) => (
            <div key={p.providerId} className="steps-footer-row">
              <span>{p.providerLabel}</span>
              <span>
                {p.turnCalls} call(s) · {formatBillable(p.turnBillable, chatPayment.tokenSymbol)}
              </span>
            </div>
          ))}
          <div className="steps-footer-row steps-footer-total">
            <span>Pending settlement</span>
            <span>
              {chatPayment.sessionCalls} call(s) ·{" "}
              {formatBillable(chatPayment.sessionBillable, chatPayment.tokenSymbol)}
            </span>
          </div>
        </div>
      )}

      <SettleFooter
        phase={settlePhase}
        stage={settleStage}
        outcome={settleOutcome}
        error={settleError}
        errorAction={settleErrorAction}
        hasBillable={hasBillable}
        onSettle={onSettle}
        onNewSession={onNewSession}
      />
    </aside>
  );
}

function SettleFooter({
  phase,
  stage,
  outcome,
  error,
  errorAction,
  hasBillable,
  onSettle,
  onNewSession,
}: {
  phase: SettlePhase;
  stage: number;
  outcome: SettleOutcome | null;
  error: string | null;
  errorAction: "settle" | "open" | null;
  hasBillable: boolean;
  onSettle: () => void;
  onNewSession: () => void;
}) {
  if (phase === "settling") {
    return (
      <footer className="steps-footer settle-footer">
        <strong>Settling channel</strong>
        <ol className="settle-stages">
          {SETTLE_STAGES.map((s, i) => {
            const state = i < stage ? "done" : i === stage ? "active" : "pending";
            return (
              <li key={i} className={`settle-stage settle-stage-${state}`}>
                <span className="settle-stage-dot" />
                <div>
                  <span className="settle-stage-label">{s.label}</span>
                  <span className="settle-stage-detail">{s.detail}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </footer>
    );
  }

  if (phase === "opening") {
    return (
      <footer className="steps-footer settle-footer">
        <strong>Opening new channel</strong>
        <span className="settle-note">Discovering provider terms · funding a fresh escrow…</span>
      </footer>
    );
  }

  if (phase === "settled" && outcome) {
    return (
      <footer className="steps-footer settle-footer">
        <strong>Settlement complete</strong>
        <ol className="settle-stages">
          {outcome.steps
            .filter((s) => s.kind !== "skipped")
            .map((s, i) => (
              <li key={i} className="settle-stage settle-stage-done">
                <span className="settle-stage-dot" />
                <div>
                  <span className="settle-stage-label">{s.label}</span>
                  {s.detail && <span className="settle-stage-detail">{s.detail}</span>}
                </div>
              </li>
            ))}
        </ol>
        {outcome.settlementAmount && (
          <div className="steps-footer-row steps-footer-total">
            <span>Settled to provider</span>
            <span>{formatBillable(outcome.settlementAmount, outcome.tokenSymbol)}</span>
          </div>
        )}
        <button type="button" className="settle-btn settle-btn-new" onClick={onNewSession}>
          New Session
        </button>
      </footer>
    );
  }

  // idle or error
  return (
    <footer className="steps-footer settle-footer">
      {error && <span className="settle-error">{error}</span>}
      {phase === "error" && errorAction === "open" ? (
        <button type="button" className="settle-btn settle-btn-new" onClick={onNewSession}>
          Retry New Session
        </button>
      ) : (
        <button
          type="button"
          className="settle-btn"
          onClick={onSettle}
          disabled={!hasBillable}
          title={hasBillable ? "Close and settle the live channel" : "No metered calls to settle yet"}
        >
          {phase === "error" ? "Retry Settle" : "Settle"}
        </button>
      )}
    </footer>
  );
}
