import "./chat.css";
import ChatPanel from "../../components/dashboard/ChatPanel";

export default function DashboardPage() {
  return (
    <main className="chat-shell" aria-label="Chatbot interface">
      <section className="chat-panel" aria-label="Chat conversation">
        <ChatPanel />
      </section>

      <aside className="chat-sidebar" aria-label="Sidebar" />
    </main>
  );
}
