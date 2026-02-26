import { useState } from "react";
import "./AutomationContent.css";

export const AutomationContent = () => {
  const [tasks] = useState({
    backlog: [
      { id: 1, title: "Research trending hashtags", priority: "medium" },
      { id: 2, title: "Plan content calendar", priority: "low" }
    ],
    todo: [
      { id: 3, title: "Create Instagram post", priority: "high" },
      { id: 4, title: "Schedule tweets for next week", priority: "medium" }
    ],
    inProgress: [
      { id: 5, title: "Design social media graphics", priority: "high" }
    ],
    done: [
      { id: 6, title: "Posted daily update", priority: "low" }
    ]
  });

  const getPriorityColor = (priority) => {
    switch (priority) {
      case "high":
        return "#ef4444";
      case "medium":
        return "#f59e0b";
      case "low":
        return "#10b981";
      default:
        return "#6b7280";
    }
  };

  return (
    <div className="automation-container">
      <div className="automation-header">
        <h1 className="automation-title">Automation</h1>
        <p className="automation-subtitle">Manage your workflow with our task board</p>
      </div>

      <div className="kanban-section">
        <div className="kanban-board">
          <div className="kanban-column">
            <div className="column-header">
              <h3 className="column-title">Backlog</h3>
              <span className="task-count">{tasks.backlog.length}</span>
            </div>
            <div className="column-content">
              {tasks.backlog.map((task) => (
                <div key={task.id} className="task-card">
                  <div className="task-header">
                    <span
                      className="priority-badge"
                      style={{ backgroundColor: getPriorityColor(task.priority) }}
                    >
                      {task.priority}
                    </span>
                  </div>
                  <p className="task-title">{task.title}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="kanban-column">
            <div className="column-header">
              <h3 className="column-title">To Do</h3>
              <span className="task-count">{tasks.todo.length}</span>
            </div>
            <div className="column-content">
              {tasks.todo.map((task) => (
                <div key={task.id} className="task-card">
                  <div className="task-header">
                    <span
                      className="priority-badge"
                      style={{ backgroundColor: getPriorityColor(task.priority) }}
                    >
                      {task.priority}
                    </span>
                  </div>
                  <p className="task-title">{task.title}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="kanban-column">
            <div className="column-header">
              <h3 className="column-title">In Progress</h3>
              <span className="task-count">{tasks.inProgress.length}</span>
            </div>
            <div className="column-content">
              {tasks.inProgress.map((task) => (
                <div key={task.id} className="task-card">
                  <div className="task-header">
                    <span
                      className="priority-badge"
                      style={{ backgroundColor: getPriorityColor(task.priority) }}
                    >
                      {task.priority}
                    </span>
                  </div>
                  <p className="task-title">{task.title}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="kanban-column">
            <div className="column-header">
              <h3 className="column-title">Done</h3>
              <span className="task-count">{tasks.done.length}</span>
            </div>
            <div className="column-content">
              {tasks.done.map((task) => (
                <div key={task.id} className="task-card">
                  <div className="task-header">
                    <span
                      className="priority-badge"
                      style={{ backgroundColor: getPriorityColor(task.priority) }}
                    >
                      {task.priority}
                    </span>
                  </div>
                  <p className="task-title">{task.title}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
