import "./chat.css";
import ChatShell from "../../components/dashboard/ChatShell";
import { WalletProvider } from "../../lib/wallet-context";

export default function DashboardPage() {
  return (
    <WalletProvider>
      <main className="chat-shell" aria-label="Chatbot interface">
        <ChatShell />
      </main>
    </WalletProvider>
  );
}
