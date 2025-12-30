import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { LoginPage } from "./components/auth/LoginPage";
import { SignUpPage } from "./components/auth/SignUpPage";
import { Sidebar } from "./components/layout/Sidebar";
import { TopHeader } from "./components/layout/TopHeader";
import { MainContent } from "./components/layout/MainContent";
import { DashboardContent } from "./components/DashboardContent";
import { ComposeContent } from "./components/ComposeContent";
import { PostsContent } from "./components/PostsContent";
import { BrandProfileContent } from "./components/BrandProfileContent";
import { ScheduleContent } from "./components/ScheduleContent";
import { AssetsContent } from "./components/AssetsContent";
import { SocialInboxContent } from "./components/SocialInboxContent";
import { AutomationContent } from "./components/AutomationContent";
import { SocialsContent } from "./components/SocialsContent";
import { TeamContent } from "./components/TeamContent";
import { SettingsContent } from "./components/SettingsContent";
import "./App.css";

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />

          {/* Protected routes */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <div className="app-container">
                  <Sidebar />
                  <TopHeader />
                  <MainContent>
                    <Routes>
                      <Route path="/" element={<Navigate to="/dashboard" replace />} />
                      <Route path="/dashboard" element={<DashboardContent />} />
                      <Route path="/brand-profile" element={<BrandProfileContent />} />
                      <Route path="/compose" element={<ComposeContent />} />
                      <Route path="/schedule" element={<ScheduleContent />} />
                      <Route path="/posts" element={<PostsContent />} />
                      <Route path="/assets" element={<AssetsContent />} />
                      <Route path="/social-inbox" element={<SocialInboxContent />} />
                      <Route path="/automation" element={<AutomationContent />} />
                      <Route path="/socials" element={<SocialsContent />} />
                      <Route path="/team" element={<TeamContent />} />
                      <Route path="/settings" element={<SettingsContent />} />
                    </Routes>
                  </MainContent>
                </div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
