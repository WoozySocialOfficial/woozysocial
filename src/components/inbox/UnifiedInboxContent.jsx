import { useWorkspace } from "../../contexts/WorkspaceContext";
import { CommentsPanel } from "./CommentsPanel";
import "./UnifiedInboxContent.css";

export const UnifiedInboxContent = () => {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id;

  if (!workspaceId) {
    return (
      <div className="unified-inbox-container">
        <div className="unified-empty-state">
          <div className="empty-icon">📭</div>
          <p className="empty-text">No Workspace Selected</p>
          <p className="empty-subtext">Please select or create a workspace to view your inbox.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="unified-inbox-container">
      {/* Header */}
      <div className="unified-inbox-header">
        <div className="unified-inbox-header-left">
          <h1 className="unified-inbox-title">Social Inbox</h1>
          <p className="unified-inbox-subtitle">
            Manage comments across your social platforms
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="unified-inbox-content">
        <CommentsPanel />
      </div>
    </div>
  );
};
