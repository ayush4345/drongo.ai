import "./chat.css";

export default function ChatPage() {
  return (
    <main className="chat-shell" aria-label="Chatbot interface">
      <section className="chat-panel" aria-label="Chat conversation">
        <header className="chat-header">
          <div className="chat-title">
            <span className="eyebrow">Chatbot</span>
          </div>
          <span className="status">Ready</span>
        </header>

        <div className="chat-empty" aria-label="Empty conversation">
          <h2>What can I help with?</h2>
          <p>Start a conversation by typing a message below.</p>
        </div>

        <form className="chat-composer" aria-label="Chat input">
          <label className="sr-only" htmlFor="chat-input">
            Ask anything
          </label>
          <textarea
            id="chat-input"
            name="message"
            placeholder="Ask anything"
            autoComplete="off"
            rows={1}
          />
          <button type="submit" aria-label="Send message">
            <span aria-hidden="true">↑</span>
          </button>
        </form>
      </section>

      <aside className="chat-sidebar" aria-label="Sidebar" />
    </main>
  );
}
