import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { AuthProvider } from "./contexts/AuthContext";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { RoleBasedRedirect } from "./components/auth/RoleBasedRedirect";
import { Sidebar } from "./components/layout/Sidebar";
import { TopHeader } from "./components/layout/TopHeader";
import { MainContent } from "./components/layout/MainContent";
import { ClientLayout } from "./components/layout/ClientLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { OnboardingWrapper } from "./components/OnboardingWrapper";
import { getOrganizationSchema, getWebSiteSchema } from "./utils/seoConfig";
import "./App.css";

// Retry wrapper for lazy imports - retries once on chunk load failure
const lazyRetry = (importFn) =>
  lazy(() => importFn().catch(() => {
    // If chunk fails to load (e.g. after a deploy), reload the page once
    const hasReloaded = sessionStorage.getItem('chunk_reload');
    if (!hasReloaded) {
      sessionStorage.setItem('chunk_reload', 'true');
      window.location.reload();
      return new Promise(() => {}); // never resolves, page is reloading
    }
    sessionStorage.removeItem('chunk_reload');
    return importFn(); // retry once more, will throw if still fails
  }));

// Lazy load all page components - only loaded when user navigates to them
const LoginPage = lazyRetry(() => import("./components/auth/LoginPage").then(m => ({ default: m.LoginPage })));
const SignUpPage = lazyRetry(() => import("./components/auth/SignUpPage").then(m => ({ default: m.SignUpPage })));
const ResetPasswordPage = lazyRetry(() => import("./components/auth/ResetPasswordPage").then(m => ({ default: m.ResetPasswordPage })));
const AcceptInvite = lazyRetry(() => import("./pages/AcceptInvite").then(m => ({ default: m.AcceptInvite })));
const TokenLogin = lazyRetry(() => import("./pages/TokenLogin"));

// Main app pages - lazy loaded
const DashboardContent = lazyRetry(() => import("./components/DashboardContent").then(m => ({ default: m.DashboardContent })));
const ComposeContent = lazyRetry(() => import("./components/ComposeContent").then(m => ({ default: m.ComposeContent })));
const PostsContent = lazyRetry(() => import("./components/PostsContent").then(m => ({ default: m.PostsContent })));
const BrandProfileContent = lazyRetry(() => import("./components/BrandProfileContent").then(m => ({ default: m.BrandProfileContent })));
const ScheduleContent = lazyRetry(() => import("./components/ScheduleContent").then(m => ({ default: m.ScheduleContent })));
const AssetsContent = lazyRetry(() => import("./components/AssetsContent").then(m => ({ default: m.AssetsContent })));
const UnifiedInboxContent = lazyRetry(() => import("./components/inbox/UnifiedInboxContent").then(m => ({ default: m.UnifiedInboxContent })));
const TeamContent = lazyRetry(() => import("./components/TeamContent").then(m => ({ default: m.TeamContent })));
const AgencyTeamContent = lazyRetry(() => import("./components/AgencyTeamContent").then(m => ({ default: m.AgencyTeamContent })));
const SettingsContent = lazyRetry(() => import("./components/SettingsContent").then(m => ({ default: m.SettingsContent })));
const ProfileSettings = lazyRetry(() => import("./components/ProfileSettings").then(m => ({ default: m.ProfileSettings })));
const Approvals = lazyRetry(() => import("./pages/Approvals").then(m => ({ default: m.Approvals })));
const Pricing = lazyRetry(() => import("./pages/Pricing"));
const Notifications = lazyRetry(() => import("./pages/Notifications").then(m => ({ default: m.Notifications })));

// Client portal pages - lazy loaded
const ClientDashboard = lazyRetry(() => import("./pages/client/ClientDashboard").then(m => ({ default: m.ClientDashboard })));
const ClientApprovals = lazyRetry(() => import("./pages/client/ClientApprovals").then(m => ({ default: m.ClientApprovals })));
const ClientApproved = lazyRetry(() => import("./pages/client/ClientApproved").then(m => ({ default: m.ClientApproved })));
const ClientCalendar = lazyRetry(() => import("./pages/client/ClientCalendar").then(m => ({ default: m.ClientCalendar })));
const ClientAnalytics = lazyRetry(() => import("./pages/client/ClientAnalytics").then(m => ({ default: m.ClientAnalytics })));
const ClientBrandProfile = lazyRetry(() => import("./pages/client/ClientBrandProfile").then(m => ({ default: m.ClientBrandProfile })));
const ClientInbox = lazyRetry(() => import("./pages/client/ClientInbox").then(m => ({ default: m.ClientInbox })));
const ClientTeam = lazyRetry(() => import("./pages/client/ClientTeam").then(m => ({ default: m.ClientTeam })));
const ClientProfileSettings = lazyRetry(() => import("./pages/client/ClientProfileSettings").then(m => ({ default: m.ClientProfileSettings })));

// 404 page
const NotFound = lazyRetry(() => import("./pages/NotFound"));

// Prefetch the dashboard chunk on idle since it's the most common landing page
if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
  requestIdleCallback(() => {
    import("./components/DashboardContent").catch(() => {});
  });
} else {
  // Fallback: prefetch after a short delay
  setTimeout(() => {
    import("./components/DashboardContent").catch(() => {});
  }, 2000);
}

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
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <WorkspaceProvider>
          <Router>
          {/* Global Schema.org Structured Data */}
          <Helmet>
            <script type="application/ld+json">
              {JSON.stringify(getOrganizationSchema())}
            </script>
            <script type="application/ld+json">
              {JSON.stringify(getWebSiteSchema())}
            </script>
          </Helmet>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignUpPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/accept-invite" element={<AcceptInvite />} />
              <Route path="/auth/token-login" element={<TokenLogin />} />

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
                        <Route path="/team" element={<ClientTeam />} />
                        <Route path="/brand-profile" element={<ClientBrandProfile />} />
                        <Route path="/assets" element={<AssetsContent />} />
                        <Route path="/social-inbox" element={<ClientInbox />} />
                        <Route path="/analytics" element={<ClientAnalytics />} />
                        <Route path="/profile-settings" element={<ClientProfileSettings />} />
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
                    <OnboardingWrapper>
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
                            <Route path="/engagement" element={<Navigate to="/social-inbox?tab=comments" replace />} />
                            <Route path="/social-inbox" element={<UnifiedInboxContent />} />
                            <Route path="/team" element={<TeamContent />} />
                            <Route path="/agency-team" element={<Navigate to="/team" replace />} />
                            <Route path="/approvals" element={<Approvals />} />
                            <Route path="/notifications" element={<Notifications />} />
                            <Route path="/settings" element={<SettingsContent />} />
                            <Route path="/profile-settings" element={<ProfileSettings />} />
                            <Route path="/pricing" element={<Pricing />} />
                          </Routes>
                        </MainContent>
                      </div>
                    </OnboardingWrapper>
                  </RoleBasedRedirect>
                </ProtectedRoute>
              }
            />

            {/* 404 catch-all route */}
            <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          </Router>
        </WorkspaceProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
