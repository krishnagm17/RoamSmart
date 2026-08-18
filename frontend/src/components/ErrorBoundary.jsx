import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0f0d",
          color: "#eef4f0",
          padding: "24px",
          textAlign: "center"
        }}>
          <h2 style={{ fontSize: "24px", marginBottom: "12px", color: "#34d399" }}>Something went wrong</h2>
          <p style={{ color: "rgba(255,255,255,0.7)", maxWidth: "500px", marginBottom: "24px", fontSize: "14px" }}>
            {this.state.error?.message || "An unexpected error occurred while rendering the page."}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.hash = "#dashboard";
              window.location.reload();
            }}
            style={{
              background: "#34d399",
              color: "#0a0f0d",
              border: "none",
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: "bold",
              cursor: "pointer"
            }}
          >
            Reload to Dashboard
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
