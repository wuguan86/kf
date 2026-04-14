import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import ForceLogoutModal from "./components/ForceLogoutModal";
import { clearAuthSnapshot } from "./auth/authStore";
import { createSessionEventsConnection } from "./auth/sessionEvents";
import http from "./utils/http";

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
  const [sessionId, setSessionId] = useState<string>(
    localStorage.getItem("sessionId") || "",
  );
  const [isLoginStatusChecking, setIsLoginStatusChecking] = useState<boolean>(
    Boolean(
      localStorage.getItem("userToken") && localStorage.getItem("sessionId"),
    ),
  );
  const [showLoginAlert, setShowLoginAlert] = useState(false);
  const [showForceLogoutModal, setShowForceLogoutModal] = useState(false);
  const isLoggedIn = Boolean(userToken && sessionId);

  const navigate = useCallback((next: HashRoute) => {
    const nextHash = next === "assistant" ? "#/" : `#/${next}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
    setHash(nextHash);
  }, []);

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const handleAuthExpired = () => {
      clearAuthSnapshot();
      setUserToken("");
      setSessionId("");
      setShowLoginAlert(false);
      navigate("assistant");
    };
    window.addEventListener("auth-expired", handleAuthExpired);
    return () => window.removeEventListener("auth-expired", handleAuthExpired);
  }, [navigate]);

  useEffect(() => {
    localStorage.setItem("backendBaseUrl", backendBaseUrl);
  }, [backendBaseUrl]);

  useEffect(() => {
    localStorage.setItem("tenantId", tenantId);
  }, [tenantId]);

  useEffect(() => {
    localStorage.setItem("userToken", userToken);
  }, [userToken]);

  useEffect(() => {
    localStorage.setItem("sessionId", sessionId);
  }, [sessionId]);

  const doLogout = () => {
    clearAuthSnapshot();
    setUserToken("");
    setSessionId("");
    setShowLoginAlert(false);
    navigate("assistant");
  };

  useEffect(() => {
    if (!isLoggedIn) {
      setIsLoginStatusChecking(false);
      if (userToken || sessionId) {
        clearAuthSnapshot();
        setUserToken("");
        setSessionId("");
      }
      return;
    }

    let cancelled = false;
    setIsLoginStatusChecking(true);

    const validateLoginStatus = async () => {
      try {
        const safeTenantId = normalizeTenantId(tenantId);
        await http.get("/api/user/me", {
          headers: {
            Authorization: `Bearer ${userToken}`,
            "X-Tenant-Id": safeTenantId,
          },
        });
      } catch (error: any) {
        if (cancelled) {
          return;
        }
        if (error?.response?.status === 401) {
          clearAuthSnapshot();
          setUserToken("");
          setSessionId("");
          setShowLoginAlert(false);
          navigate("assistant");
        }
      } finally {
        if (!cancelled) {
          setIsLoginStatusChecking(false);
        }
      }
    };

    void validateLoginStatus();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, navigate, sessionId, tenantId, userToken]);

  useEffect(() => {
    if (!userToken || !sessionId) {
      return;
    }
    // 登录后常驻监听会话事件，一旦收到互踢消息立即执行强制下线流程
    const disconnect = createSessionEventsConnection({
      backendBaseUrl,
      token: userToken,
      tenantId,
      onEvent: async (event) => {
        if ((event.eventType || "").toUpperCase() !== "FORCE_LOGOUT") {
          return;
        }
        console.warn("检测到互踢下线事件，准备停止自动化并退出登录", event);
        try {
          const api = (window as any).api;
          if (api?.stopWeChatBridge) {
            await api.stopWeChatBridge();
          }
        } catch (error) {
          console.error("停止桥接进程失败，但将继续执行强制下线", error);
        }
        window.dispatchEvent(new CustomEvent("force-logout"));
        doLogout();
        setShowForceLogoutModal(true);
      },
      onError: (error) => {
        console.warn("会话SSE连接异常，稍后自动重连", error);
      },
    });
    return () => {
      disconnect();
    };
  }, [backendBaseUrl, tenantId, userToken, sessionId]);

  if (route === "capture") {
    return <Capture />;
  }

  if (isLoginStatusChecking) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-secondary)",
          fontSize: "14px",
        }}
      >
        正在检查登录状态...
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <>
        <LoginPage
          backendBaseUrl={backendBaseUrl}
          tenantId={tenantId}
          onLoginSuccess={(auth) => {
            setUserToken(auth.token);
            setSessionId(auth.sessionId);
            setTenantId(normalizeTenantId(auth.tenantId));
            setIsLoginStatusChecking(false);
            navigate("assistant");
            setShowLoginAlert(true);
          }}
        />
        <ForceLogoutModal
          isOpen={showForceLogoutModal}
          onRelogin={() => setShowForceLogoutModal(false)}
        />
      </>
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
            onLogout={doLogout}
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
            onLogout={doLogout}
          />
        )}
        {activeRoute === "me" && (
          <MePage
            backendBaseUrl={backendBaseUrl}
            tenantId={tenantId}
            userToken={userToken}
            onLogout={doLogout}
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
      <ForceLogoutModal
        isOpen={showForceLogoutModal}
        onRelogin={() => setShowForceLogoutModal(false)}
      />
    </>
  );
}

export default App;
