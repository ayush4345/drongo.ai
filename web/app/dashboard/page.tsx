import "./chat.css";
import ChatShell from "../../components/dashboard/ChatShell";

export default function DashboardPage() {
  return (
    <main className="chat-shell" aria-label="Chatbot interface">
      <ChatShell />
    </main>
  );
}
