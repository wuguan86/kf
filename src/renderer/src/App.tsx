import React, { useEffect, useMemo, useState } from "react";
import { AppConfig } from "./config";
import Capture from "./components/Capture";
import AppShell, { AppRoute } from "./layout/AppShell";
import AssistantPage from "./pages/AssistantPage";
import LoginPage from "./pages/LoginPage";
import MePage from "./pages/MePage";
import KnowledgeBasePage from "./pages/KnowledgeBasePage";
import SettingsPage from "./pages/SettingsPage";
import SystemSettingsPage from "./pages/SystemSettingsPage";
import SessionManagementPage from "./pages/SessionManagementPage";
import MarketingManagementPage from "./pages/MarketingManagementPage";
import DataStatisticsPage from "./pages/DataStatisticsPage";
import { AlertDialog } from "./components/AlertDialog";

type HashRoute = AppRoute | "capture";

const parseHashRoute = (hash: string): HashRoute => {
  const value = (hash || "#/").toLowerCase();
  if (value === "#capture" || value === "#/capture") return "capture";
  if (value.startsWith("#/settings")) return "settings";
  if (value.startsWith("#/knowledge")) return "knowledge";
  if (value.startsWith("#/session-management")) return "session-management";
  if (value.startsWith("#/marketing")) return "marketing";
  if (value.startsWith("#/data-statistics")) return "data-statistics";
  if (value.startsWith("#/system-settings")) return "system-settings";
  if (value.startsWith("#/me")) return "me";
  return "assistant";
};

function App(): JSX.Element {
  const [hash, setHash] = useState(window.location.hash || "#/");
  const route = useMemo(() => parseHashRoute(hash), [hash]);

  const normalizeTenantId = (value: string) =>
    value.trim() || AppConfig.defaultTenantId;
  const [backendBaseUrl, setBackendBaseUrl] = useState<string>(
    localStorage.getItem("backendBaseUrl") || AppConfig.apiBaseUrl,
  );
  const [tenantId, setTenantId] = useState<string>(
    normalizeTenantId(localStorage.getItem("tenantId") || ""),
  );
  const [userToken, setUserToken] = useState<string>(
    localStorage.getItem("userToken") || "",
  );
  const [showLoginAlert, setShowLoginAlert] = useState(false);

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    localStorage.setItem("backendBaseUrl", backendBaseUrl);
  }, [backendBaseUrl]);

  useEffect(() => {
    localStorage.setItem("tenantId", tenantId);
  }, [tenantId]);

  useEffect(() => {
    localStorage.setItem("userToken", userToken);
  }, [userToken]);

  const navigate = (next: HashRoute) => {
    const nextHash = next === "assistant" ? "#/" : `#/${next}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  };

  if (route === "capture") {
    return <Capture />;
  }

  if (!userToken) {
    return (
      <LoginPage
        backendBaseUrl={backendBaseUrl}
        tenantId={tenantId}
        onLoginSuccess={(auth) => {
          setUserToken(auth.token);
          setTenantId(normalizeTenantId(auth.tenantId));
          navigate("assistant");
          setShowLoginAlert(true);
        }}
      />
    );
  }

  const activeRoute: AppRoute = route;

  return (
    <>
      <AppShell 
        activeRoute={activeRoute} 
        onNavigate={navigate}
        backendBaseUrl={backendBaseUrl}
        tenantId={tenantId}
        userToken={userToken}
      >
        {activeRoute === "assistant" && (
          <AssistantPage
            backendBaseUrl={backendBaseUrl}
            tenantId={tenantId}
            userToken={userToken}
            onNavigateSettings={() => navigate("settings")}
            onNavigateMe={() => navigate("me")}
            onLogout={() => {
              setUserToken("");
              navigate("assistant");
            }}
          />
        )}
        {activeRoute === "settings" && (
          <SettingsPage
            backendBaseUrl={backendBaseUrl}
            tenantId={tenantId}
            userToken={userToken}
            setUserToken={setUserToken}
          />
        )}
        {activeRoute === "knowledge" && (
          <KnowledgeBasePage
            backendBaseUrl={backendBaseUrl}
            tenantId={tenantId}
            userToken={userToken}
          />
        )}
        {activeRoute === "session-management" && (
          <SessionManagementPage
            backendBaseUrl={backendBaseUrl}
            tenantId={tenantId}
            userToken={userToken}
          />
        )}
        {activeRoute === "marketing" && <MarketingManagementPage />}
        {activeRoute === "data-statistics" && <DataStatisticsPage />}
        {activeRoute === "system-settings" && (
          <SystemSettingsPage
            onLogout={() => {
              setUserToken("");
              navigate("assistant");
            }}
          />
        )}
        {activeRoute === "me" && (
          <MePage
            backendBaseUrl={backendBaseUrl}
            tenantId={tenantId}
            userToken={userToken}
            onLogout={() => {
              setUserToken("");
              navigate("assistant");
            }}
          />
        )}
      </AppShell>

      <AlertDialog
        isOpen={showLoginAlert}
        title="提示"
        content="为了能够更好的分析对话，请保持微信客户端的显示。"
        onConfirm={() => setShowLoginAlert(false)}
        confirmText="我知道了"
      />
    </>
  );
}

export default App;
