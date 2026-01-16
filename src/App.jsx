import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { RoleBasedRedirect } from "./components/auth/RoleBasedRedirect";
import { Sidebar } from "./components/layout/Sidebar";
import { TopHeader } from "./components/layout/TopHeader";
import { MainContent } from "./components/layout/MainContent";
import { ClientLayout } from "./components/layout/ClientLayout";
import "./App.css";

// Lazy load all page components - only loaded when user navigates to them
const LoginPage = lazy(() => import("./components/auth/LoginPage").then(m => ({ default: m.LoginPage })));
const SignUpPage = lazy(() => import("./components/auth/SignUpPage").then(m => ({ default: m.SignUpPage })));
const ResetPasswordPage = lazy(() => import("./components/auth/ResetPasswordPage").then(m => ({ default: m.ResetPasswordPage })));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite").then(m => ({ default: m.AcceptInvite })));

// Main app pages - lazy loaded
const DashboardContent = lazy(() => import("./components/DashboardContent").then(m => ({ default: m.DashboardContent })));
const ComposeContent = lazy(() => import("./components/ComposeContent").then(m => ({ default: m.ComposeContent })));
const PostsContent = lazy(() => import("./components/PostsContent").then(m => ({ default: m.PostsContent })));
const BrandProfileContent = lazy(() => import("./components/BrandProfileContent").then(m => ({ default: m.BrandProfileContent })));
const ScheduleContent = lazy(() => import("./components/ScheduleContent").then(m => ({ default: m.ScheduleContent })));
const AssetsContent = lazy(() => import("./components/AssetsContent").then(m => ({ default: m.AssetsContent })));
const SocialInboxContent = lazy(() => import("./components/SocialInboxContent").then(m => ({ default: m.SocialInboxContent })));
const TeamContent = lazy(() => import("./components/TeamContent").then(m => ({ default: m.TeamContent })));
const SettingsContent = lazy(() => import("./components/SettingsContent").then(m => ({ default: m.SettingsContent })));
const EngagementContent = lazy(() => import("./components/EngagementContent").then(m => ({ default: m.EngagementContent })));
const Approvals = lazy(() => import("./pages/Approvals").then(m => ({ default: m.Approvals })));
const Pricing = lazy(() => import("./pages/Pricing"));
const Notifications = lazy(() => import("./pages/Notifications").then(m => ({ default: m.Notifications })));

// Client portal pages - lazy loaded
const ClientDashboard = lazy(() => import("./pages/client/ClientDashboard").then(m => ({ default: m.ClientDashboard })));
const ClientApprovals = lazy(() => import("./pages/client/ClientApprovals").then(m => ({ default: m.ClientApprovals })));
const ClientApproved = lazy(() => import("./pages/client/ClientApproved").then(m => ({ default: m.ClientApproved })));
const ClientCalendar = lazy(() => import("./pages/client/ClientCalendar").then(m => ({ default: m.ClientCalendar })));

// Loading fallback component
const PageLoader = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    minHeight: '200px'
  }}>
    <div style={{
      width: '40px',
      height: '40px',
      border: '3px solid #f3f3f3',
      borderTop: '3px solid #7c3aed',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }} />
    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <Router>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignUpPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/accept-invite" element={<AcceptInvite />} />

            {/* Client Portal Routes */}
            <Route
              path="/client/*"
              element={
                <ProtectedRoute>
                  <RoleBasedRedirect>
                    <ClientLayout>
                      <Routes>
                        <Route path="/" element={<Navigate to="/client/dashboard" replace />} />
                        <Route path="/dashboard" element={<ClientDashboard />} />
                        <Route path="/approvals" element={<ClientApprovals />} />
                        <Route path="/approved" element={<ClientApproved />} />
                        <Route path="/calendar" element={<ClientCalendar />} />
                        <Route path="/notifications" element={<Notifications />} />
                      </Routes>
                    </ClientLayout>
                  </RoleBasedRedirect>
                </ProtectedRoute>
              }
            />

            {/* Main App Routes (Admin/Editor) */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <RoleBasedRedirect>
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
                          <Route path="/engagement" element={<EngagementContent />} />
                          <Route path="/social-inbox" element={<SocialInboxContent />} />
                          <Route path="/team" element={<TeamContent />} />
                          <Route path="/approvals" element={<Approvals />} />
                          <Route path="/notifications" element={<Notifications />} />
                          <Route path="/settings" element={<SettingsContent />} />
                          <Route path="/pricing" element={<Pricing />} />
                        </Routes>
                      </MainContent>
                    </div>
                  </RoleBasedRedirect>
                </ProtectedRoute>
              }
            />
            </Routes>
          </Suspense>
        </Router>
      </WorkspaceProvider>
    </AuthProvider>
  );
}

export default App;
