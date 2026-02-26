import { ClientSidebar } from "./ClientSidebar";
import { ClientHeader } from "./ClientHeader";
import "./ClientLayout.css";

export const ClientLayout = ({ children }) => {
  return (
    <div className="client-layout">
      <ClientSidebar />
      <ClientHeader />
      <main className="client-main-content">
        {children}
      </main>
    </div>
  );
};
