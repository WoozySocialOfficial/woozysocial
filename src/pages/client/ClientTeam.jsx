import { TeamContent } from "../../components/TeamContent";
import "./ClientTeam.css";

export const ClientTeam = () => {
  return (
    <div className="client-team-page">
      <div className="client-team-header">
        <h1>Team Management</h1>
        <p>View and manage team members who have access to your workspace.</p>
      </div>

      <TeamContent />
    </div>
  );
};
