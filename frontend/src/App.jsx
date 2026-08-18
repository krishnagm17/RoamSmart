import { AnimatePresence, motion } from "framer-motion";
import api from "./api.js";
import { useRef, useState, useEffect } from "react";
import StepOne from "./components/StepOne.jsx";
import LoadingScreen from "./components/LoadingScreen.jsx";
import ItineraryResult from "./components/ItineraryResult.jsx";
import ScorePanel from "./components/ScorePanel.jsx";
import LandmarkScanner from "./components/LandmarkScanner.jsx";
import PhotoJournal from "./components/PhotoJournal.jsx";
import SOSScreen from "./components/SOSScreen.jsx";
import MyTripsScreen from "./components/MyTripsScreen.jsx";
import RoamSplitScreen from "./components/roamsplit/RoamSplitScreen.jsx";
import RoamGroupsScreen from "./components/roamgroups/RoamGroupsScreen.jsx";
import { parseInviteCode } from "./components/roamgroups/groupsEngine.js";
import ProfileScreen from "./components/ProfileScreen.jsx";
import Toast, { useToast } from "./components/Toast.jsx";
import { useAuth } from "./auth/AuthContext.jsx";
import AuthScreen from "./auth/AuthScreen.jsx";

import { useAlerts } from "./hooks/useAlerts";
import { requestPushPermission, listenForPushMessages } from "./utils/pushNotification";
import AlertBanner from "./components/AlertBanner";
import ActiveAlerts from "./components/ActiveAlerts";
import AlertSettings from "./components/AlertSettings";


import TopHeader from "./components/TopHeader";
import Dashboard from "./components/Dashboard";
import Footer from "./components/Footer";
import TripSafetyDashboard from "./components/TripSafetyDashboard";



const screenMotion = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -18 },
  transition: { duration: 0.35, ease: "easeOut" }
};

const VALID_TABS = ["dashboard", "plan", "trips", "split", "groups", "profile", "scanner", "journal", "safety", "sos", "alerts", "login"];

function sanitizeTab(tab) {
  if (!tab) return "dashboard";
  const clean = String(tab).replace(/^#/, "").trim();
  if (clean === "groups" || clean.startsWith("roamgroups") || clean.startsWith("invite") || clean.startsWith("join")) {
    return "groups";
  }
  if (VALID_TABS.includes(clean)) {
    return clean;
  }
  return "dashboard";
}

export default function App() {
  const auth = useAuth();
  const { toast, showToast } = useToast();
  const [screen, setScreen] = useState("form");
  const [formData, setFormData] = useState(null);
  const [itinerary, setItinerary] = useState(null);
  const [error, setError] = useState("");
  const [userInputs, setUserInputs] = useState(null);
  const [verification, setVerification] = useState(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const requestIdRef = useRef(0);
  const [rsTrip, setRsTrip] = useState(null);
  
  const [activeTab, setActiveTabState] = useState(() => {
    const code = parseInviteCode();
    if (code) return "groups";
    const stored = localStorage.getItem("roam_active_tab");
    return sanitizeTab(stored);
  });

  const setRawActiveTab = (tab) => {
    const target = sanitizeTab(tab);
    setActiveTabState(target);
    localStorage.setItem("roam_active_tab", target);
  };

  const setActiveTab = (tab) => {
    const target = sanitizeTab(tab);
    if (target === activeTab) return;
    setRawActiveTab(target);
    window.history.pushState({ tab: target }, "", `#${target}`);
  };

  useEffect(() => {
    if (auth.status === "signedIn" && activeTab === "login") {
      setActiveTab("dashboard");
    }
  }, [auth.status, activeTab]);

  useEffect(() => {
    localStorage.setItem("roam_active_tab", activeTab);
  }, [activeTab]);

  const [groupsJoinCode, setGroupsJoinCode] = useState(() => parseInviteCode());

  useEffect(() => {
    const handleUrlChange = (event) => {
      const code = parseInviteCode();
      if (code) {
        setGroupsJoinCode(code);
        setRawActiveTab("groups");
        return;
      }
      if (event && event.state && event.state.tab) {
        setRawActiveTab(event.state.tab);
      } else {
        const rawHash = window.location.hash.replace("#", "");
        if (rawHash) {
          setRawActiveTab(rawHash);
        }
      }
    };

    // Run on initial load to ensure tab matches URL if code is present
    handleUrlChange();

    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("hashchange", handleUrlChange);
    return () => {
      window.removeEventListener("popstate", handleUrlChange);
      window.removeEventListener("hashchange", handleUrlChange);
    };
  }, []);

  const [anonUserId] = useState(() => {
    let id = localStorage.getItem("roam_userId");
    if (!id) {
      id = "user_" + Math.random().toString(36).substring(2, 11);
      localStorage.setItem("roam_userId", id);
    }
    return id;
  });
  // Signed-in identity comes from Firebase; anonymous fallback keeps device flows working offline.
  const userId = auth.user?.uid || anonUserId;

  const { alerts, unreadCount, dismissAlert } = useAlerts(userId);
  const [smsPhone, setSmsPhone] = useState("");
  const [smsPromptOpen, setSmsPromptOpen] = useState(() => {
    return !localStorage.getItem("roam_sms_prompt_dismissed") && !localStorage.getItem("userPhone");
  });

  const [alertsModalOpen, setAlertsModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;

    const registerDevice = async () => {
      try {
        const storedPhone = localStorage.getItem("userPhone") || null;
        await api.post("/api/user/register", {
          userId,
          phoneNumber: storedPhone
        });

        const pushResult = await requestPushPermission();
        if (pushResult.success && pushResult.token) {
          await api.post("/api/user/update-token", {
            userId,
            fcmToken: pushResult.token
          });
        }
      } catch (err) {
        console.error("Profile/Device registration failed:", err);
      }
    };

    registerDevice();
  }, [userId]);

  useEffect(() => {
    const unsubscribe = listenForPushMessages((payload) => {
      showToast(`${payload.title}: ${payload.body}`, "info");
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [showToast]);

  const handleSmsRegister = async (e) => {
    e.preventDefault();
    if (!smsPhone.trim()) return;

    try {
      await api.post("/api/user/register", {
        userId,
        phoneNumber: smsPhone.trim()
      });
      localStorage.setItem("userPhone", smsPhone.trim());
      localStorage.setItem("roam_sms_prompt_dismissed", "true");
      setSmsPromptOpen(false);
      showToast("Subscribed to SMS alerts! 📱", "success");
    } catch (err) {
      console.error("SMS subscription failed:", err);
      showToast("Subscription failed. Please try again.", "error");
    }
  };

  const dismissSmsPrompt = () => {
    localStorage.setItem("roam_sms_prompt_dismissed", "true");
    setSmsPromptOpen(false);
  };

  async function planTrip(values) {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setFormData(values);
    setUserInputs(values);
    setError("");
    setScreen("loading");

    try {
      const endpoint = values.tripType === "multi" ? "/api/plan-multi-trip" : "/api/plan-trip";
      const response = await api.post(endpoint, values);
      if (requestId !== requestIdRef.current) return;
      setItinerary(response.data);
      setScreen("result");

      try {
        const saved = JSON.parse(localStorage.getItem("roam_saved_trips") || "[]");
        const tripToSave = {
          ...response.data,
          formData: values
        };
        const updated = [tripToSave, ...saved.filter((t) => t.title !== response.data.title)];
        localStorage.setItem("roam_saved_trips", JSON.stringify(updated));
      } catch (e) {
        console.error("Auto-save trip failed:", e);
      }

      verifyItinerary(response.data, values, requestId);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err.response?.data?.error || "Something went wrong while planning your trip.");
      setScreen("form");
    }
  }

  async function verifyItinerary(itineraryData, userInputsData, requestId) {
    setVerificationLoading(true);
    setVerification(null);
    try {
      const response = await api.post("/api/verify-itinerary", {
        itinerary: itineraryData,
        userInputs: userInputsData
      });
      if (requestId !== requestIdRef.current) return;
      setVerification(response.data);
    } catch (err) {
      console.error("Verification failed:", err);
    } finally {
      if (requestId === requestIdRef.current) {
        setVerificationLoading(false);
      }
    }
  }

  function resetTrip() {
    requestIdRef.current += 1;
    setItinerary(null);
    setVerification(null);
    setVerificationLoading(false);
    setError("");
    setScreen("form");
  }

  function startPlan(destination) {
    try {
      localStorage.setItem("roam_prefill", JSON.stringify({ destination: destination || "" }));
    } catch (err) {
      console.error("Pre-fill failed:", err);
    }
    requestIdRef.current += 1;
    setError("");
    setScreen("form");
    setActiveTab("plan");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    if (screen === "loading") {
      requestIdRef.current += 1;
      setError("");
      setScreen("form");
      return;
    }
    if (screen === "result") {
      setScreen("form");
      return;
    }
    if (screen === "form" && itinerary) {
      setScreen("result");
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
    }
  }

  function openSplit(trip) {
    setRsTrip(trip);
    setActiveTab("split");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openSafety() {
    setActiveTab("safety");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleViewTrip(trip) {
    requestIdRef.current += 1;
    const currentReqId = requestIdRef.current;

    setItinerary(trip);
    if (trip.formData) {
      setFormData(trip.formData);
    }
    setScreen("result");
    setActiveTab("plan");

    if (trip.verification) {
      setVerification(trip.verification);
      setVerificationLoading(false);
    } else {
      verifyItinerary(trip, trip.formData || {}, currentReqId);
    }
  }

  function renderTabContent() {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard setActiveTab={setActiveTab} onStartPlan={startPlan} />;
      case "plan":
        return (
          <AnimatePresence mode="wait">
            {screen === "form" && (
              <motion.div key="form" {...screenMotion} className="content-area">
                {itinerary && <BackButton onClick={goBack} />}
                <StepOne
                  initialValues={formData}
                  error={error}
                  onSubmit={planTrip}
                  onRetry={() => formData && planTrip(formData)}
                />
              </motion.div>
            )}

            {screen === "loading" && (
              <motion.div key="loading" {...screenMotion} className="content-area">
                <BackButton onClick={goBack} />
                <LoadingScreen />
              </motion.div>
            )}

            {screen === "result" && itinerary && (
              <motion.div key="result" {...screenMotion} className="content-area">
                <BackButton onClick={goBack} />
                <div className="result-layout">
                  <div className="result-main-col glass-card" style={{ padding: '24px' }}>
                    <ItineraryResult
                      itinerary={itinerary}
                      formData={formData}
                      api={api}
                      onReset={resetTrip}
                      showToast={showToast}
                      userId={userId}
                      onSplitExpenses={() => openSplit({ ...itinerary, formData: formData || itinerary.formData })}
                      onOpenSafety={openSafety}
                    />
                  </div>
                  <div className="result-sidebar-col glass-card" style={{ padding: '24px' }}>
                    <ScorePanel
                      verification={verification}
                      isLoading={verificationLoading}
                      onRegenerate={() => planTrip(userInputs)}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        );

      case "trips":
        return (
          <motion.div key="trips" {...screenMotion} className="content-area">
            <MyTripsScreen onViewTrip={handleViewTrip} />
          </motion.div>
        );

      case "split":
        return (
          <motion.div key="split" {...screenMotion} className="content-area">
            <RoamSplitScreen trip={rsTrip} userId={userId} setActiveTab={setActiveTab} showToast={showToast} />
          </motion.div>
        );

      case "groups":
        return (
          <motion.div key="groups" {...screenMotion} className="content-area">
            <RoamGroupsScreen userId={userId} joinCode={groupsJoinCode} onClearJoinCode={() => setGroupsJoinCode(null)} setActiveTab={setActiveTab} />
          </motion.div>
        );

      case "profile":
        return (
          <motion.div key="profile" {...screenMotion} className="content-area">
            <ProfileScreen showToast={showToast} />
          </motion.div>
        );

      case "scanner":
        return (
          <motion.div key="scanner" {...screenMotion} className="content-area">
            <LandmarkScanner showToast={showToast} />
          </motion.div>
        );

      case "journal":
        return (
          <motion.div key="journal" {...screenMotion} className="content-area">
            <PhotoJournal showToast={showToast} />
          </motion.div>
        );

      case "safety":
        return (
          <motion.div key="safety" {...screenMotion} className="content-area">
            <TripSafetyDashboard userId={userId} trip={itinerary || null} showToast={showToast} />
          </motion.div>
        );

      case "sos":
        return (
          <motion.div key="sos" {...screenMotion} className="content-area">
            <SOSScreen />
          </motion.div>
        );

      default:
        return <Dashboard setActiveTab={setActiveTab} onStartPlan={startPlan} />;
    }
  }

  const isAuthed = auth.status === "signedIn";

  // ── Auth handling ──
  // Signed-out visitors can BROWSE the public dashboard, but every feature tab
  // (plan, trips, split, groups, journal, scanner, alerts, profile) is locked:
  // picking one shows the sign-in screen instead.
  if (auth.status === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-main)" }}>
        <div style={{ fontFamily: "var(--font-display)", color: "var(--accent)", fontSize: 15, letterSpacing: 1 }}>
          RoamSmart · waking up…
        </div>
      </div>
    );
  }
  
  if (isAuthed && (auth.needsVerification || auth.needsProfile)) {
    return <AuthScreen />;
  }
  const GATED_TABS = ["plan", "trips", "split", "profile", "scanner", "journal", "sos", "safety", "login"];
  const showLoginPrompt = !isAuthed && GATED_TABS.includes(activeTab);

  return (
    <div className="dashboard-layout">
      <Toast toast={toast} />
      
      <main className="main-content">
        <TopHeader activeTab={activeTab} setActiveTab={setActiveTab} setSettingsModalOpen={setSettingsModalOpen} unreadCount={unreadCount} profile={auth.profile} signedIn={isAuthed} />

        {alerts.length > 0 && (
          <AlertBanner
            alerts={alerts}
            onViewAll={() => setAlertsModalOpen(true)}
            onDismiss={dismissAlert}
          />
        )}
        
        {showLoginPrompt ? (
          <div className="page-container">
            <AuthScreen />
          </div>
        ) : (activeTab !== 'dashboard' && activeTab !== 'login') ? (
          <div className="page-container">
            {renderTabContent()}
          </div>
        ) : (
          renderTabContent()
        )}

        <Footer setActiveTab={setActiveTab} />
      </main>



      <ActiveAlerts
        alerts={alerts}
        isOpen={alertsModalOpen}
        onClose={() => setAlertsModalOpen(false)}
        onDismiss={dismissAlert}
      />

      {settingsModalOpen && (
        <div className="alert-settings-modal-overlay" onClick={() => setSettingsModalOpen(false)}>
          <div className="alert-settings-modal-card" onClick={(e) => e.stopPropagation()}>
            <AlertSettings
              userId={userId}
              onClose={() => setSettingsModalOpen(false)}
              showToast={showToast}
            />
          </div>
        </div>
      )}

      {smsPromptOpen && (
        <div className="sms-onboarding-overlay" onClick={dismissSmsPrompt}>
          <div className="sms-onboarding-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sms-onboarding-drag" />
            <h3>📱 Stay Safe with SMS Alerts</h3>
            <p>Get real-time weather alerts and environmental warnings sent directly to your phone, even without internet access.</p>
            <form onSubmit={handleSmsRegister}>
              <input
                type="tel"
                placeholder="Enter phone number (e.g. +91XXXXXXXXXX)"
                value={smsPhone}
                onChange={(e) => setSmsPhone(e.target.value)}
                required
              />
              <div className="sms-onboarding-actions">
                <button type="button" className="secondary-button" onClick={dismissSmsPrompt}>Skip</button>
                <button type="submit" className="primary-button">Subscribe</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function BackButton({ onClick }) {
  return (
    <button className="back-button btn-secondary" onClick={onClick} type="button" style={{marginBottom: '20px', padding: '8px 16px', display: 'inline-flex'}}>
      <span style={{marginRight: '8px'}}>←</span> Back
    </button>
  );
}
