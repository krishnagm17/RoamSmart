import { useEffect, useState } from "react";

const messages = [
  "Researching your destination…",
  "Handpicking local experiences…",
  "Building your day-by-day schedule…",
  "Finding the best hotels & restaurants…",
  "Calculating your budget…",
  "Almost ready!"
];

export default function LoadingScreen() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % messages.length);
    }, 2000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="loading-screen" aria-live="polite">
      <div className="loading-icon">
        <i className="ti ti-map-pin-filled" aria-hidden="true" />
      </div>
      <h1>Planning your route</h1>
      <p>{messages[messageIndex]}</p>
      <div className="progress-track" aria-hidden="true">
        <div className="progress-fill" />
      </div>
    </div>
  );
}
