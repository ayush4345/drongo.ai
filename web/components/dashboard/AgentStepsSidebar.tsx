"use client";

import type { AgentTurn } from "./chat-types";

type Props = {
  turns: AgentTurn[];
  activeTurnId: string | null;
};

export default function AgentStepsSidebar({ turns, activeTurnId }: Props) {
  const active = turns.find((t) => t.id === activeTurnId) ?? turns[turns.length - 1];

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
                  <span className="step-detail">Waiting on x402 provider</span>
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
                    {step.kind === "provider" && (
                      <span className="step-detail">{step.detail}</span>
                    )}
                    {step.kind === "tool_call" && (
                      <>
                        <span className="step-meta">
                          <span className={step.served ? "paid" : "skipped"}>
                            {step.served ? "paid" : "skipped"}
                          </span>
                          {step.tool}
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
                  </div>
                </li>
              ))
            )}
          </ol>
        </div>
      )}
    </aside>
  );
}
