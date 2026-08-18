import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./styles.css";
import "./index.css";
import "./mobile.css"; /* ← Mobile responsive overrides — must be last */

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);