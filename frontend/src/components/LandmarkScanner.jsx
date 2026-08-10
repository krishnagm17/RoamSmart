import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import LandmarkResult from "./LandmarkResult.jsx";
import { Camera, CameraOff, Upload, MapPin } from 'lucide-react';
import './LuxuryForms.css';
import api from "../api.js";

export default function LandmarkScanner({ showToast }) {
  const [mode, setMode] = useState("capture");          
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [result, setResult] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [scanHistory, setScanHistory] = useState([]);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("roam_scan_history") || "[]");
      setScanHistory(saved);
    } catch {
      setScanHistory([]);
    }
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraActive]);

  async function startCamera() {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError("Camera access denied. Please upload a photo instead.");
    }
  }

  function captureFrame() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    const maxDim = 1024;
    const scale = Math.min(maxDim / video.videoWidth, maxDim / video.videoHeight, 1);
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          stopCamera();
          identifyLandmark(blob);
          setCapturedImage(URL.createObjectURL(blob));
        }
      },
      "image/jpeg",
      0.85
    );
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast?.("Please select an image file", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 1024;
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              setCapturedImage(URL.createObjectURL(blob));
              identifyLandmark(blob);
            }
          },
          "image/jpeg",
          0.85
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const identifyLandmark = useCallback(async (blob) => {
    setMode("scanning");
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("image", blob, "landmark.jpg");
      const res = await api.post("/api/identify-landmark", formData);
      const data = res.data;
      setResult(data);
      setMode("result");

      if (data.identified) {
        const entry = {
          name: data.name,
          location: data.location,
          timestamp: new Date().toISOString()
        };
        const history = JSON.parse(localStorage.getItem("roam_scan_history") || "[]");
        const updated = [entry, ...history].slice(0, 5);
        localStorage.setItem("roam_scan_history", JSON.stringify(updated));
        setScanHistory(updated);
      }
    } catch (err) {
      console.error("Identify failed:", err);
      setResult({ identified: false, error: "Could not identify landmark. Try again." });
      setMode("result");
    }
  }, []);

  function resetScanner() {
    setMode("capture");
    setResult(null);
    setCapturedImage(null);
    stopCamera();
  }

  if (mode === "result") {
    return (
      <LandmarkResult
        result={result}
        capturedImage={capturedImage}
        onScanAnother={resetScanner}
        showToast={showToast}
      />
    );
  }

  if (mode === "scanning") {
    return (
      <div className="luxury-page-wrapper" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh'}}>
        <div style={{position: 'relative', width: '200px', height: '200px', borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--accent)', marginBottom: '32px'}}>
          {capturedImage && <img src={capturedImage} alt="Captured" style={{width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5}} />}
          <div style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(to bottom, transparent, rgba(212, 184, 134, 0.2))', animation: 'pulse 1.5s infinite'}} />
        </div>
        <h2 className="font-display italic" style={{fontSize: '32px'}}>Analyzing Landmark...</h2>
        <p className="luxury-subtitle" style={{marginTop: '12px'}}>Our AI is composing the history of this place.</p>
      </div>
    );
  }

  return (
    <div className="luxury-page-wrapper">
      <header className="luxury-header" style={{textAlign: 'center', marginBottom: '40px'}}>
        <span className="luxury-kicker">LENS AR</span>
        <h1 className="luxury-title font-display">Identify <span className="italic text-sand">Landmarks</span></h1>
        <p className="luxury-subtitle">Point your camera to uncover the history and hidden detours.</p>
      </header>

      <div style={{maxWidth: '800px', margin: '0 auto', background: 'var(--bg-card)', padding: '24px', borderRadius: '24px', border: '1px solid var(--border-color)', backdropFilter: 'blur(10px)'}}>
        <div style={{position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: '16px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px'}}>
          {cameraActive ? (
            <>
              <video ref={videoRef} autoPlay playsInline muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
              {/* AR Viewfinder crosshairs */}
              <div style={{position: 'absolute', top: '10%', left: '10%', width: '40px', height: '40px', borderTop: '2px solid var(--accent)', borderLeft: '2px solid var(--accent)'}} />
              <div style={{position: 'absolute', top: '10%', right: '10%', width: '40px', height: '40px', borderTop: '2px solid var(--accent)', borderRight: '2px solid var(--accent)'}} />
              <div style={{position: 'absolute', bottom: '10%', left: '10%', width: '40px', height: '40px', borderBottom: '2px solid var(--accent)', borderLeft: '2px solid var(--accent)'}} />
              <div style={{position: 'absolute', bottom: '10%', right: '10%', width: '40px', height: '40px', borderBottom: '2px solid var(--accent)', borderRight: '2px solid var(--accent)'}} />
              <button onClick={captureFrame} style={{position: 'absolute', bottom: '24px', width: '64px', height: '64px', borderRadius: '50%', background: 'transparent', border: '4px solid #fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <div style={{width: '48px', height: '48px', borderRadius: '50%', background: '#fff'}} />
              </button>
            </>
          ) : (
            <div style={{textAlign: 'center', color: 'var(--text-secondary)'}}>
              {cameraError ? (
                <>
                  <CameraOff size={48} style={{margin: '0 auto 16px', opacity: 0.5}} />
                  <p>{cameraError}</p>
                </>
              ) : (
                <>
                  <Camera size={48} style={{margin: '0 auto 16px', opacity: 0.5}} />
                  <p className="font-mono" style={{letterSpacing: '1px'}}>VIEWFINDER INACTIVE</p>
                </>
              )}
            </div>
          )}
        </div>

        <div style={{display: 'flex', gap: '16px', justifyContent: 'center'}}>
          {!cameraActive ? (
            <button className="btn-sand" onClick={startCamera}>
              <Camera size={18} /> Activate Camera
            </button>
          ) : (
            <button className="btn-outline-sand" onClick={stopCamera}>
              <CameraOff size={18} /> Deactivate
            </button>
          )}
          <button className="btn-outline-sand" onClick={() => fileInputRef.current?.click()}>
            <Upload size={18} /> Upload Image
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{display: 'none'}} onChange={handleFileUpload} />
        </div>
      </div>

      {scanHistory.length > 0 && (
        <div style={{marginTop: '60px', maxWidth: '800px', margin: '60px auto 0'}}>
          <h3 className="font-display italic" style={{fontSize: '24px', marginBottom: '24px', color: 'var(--accent)'}}>Recent Discoveries</h3>
          <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
            {scanHistory.map((item, i) => (
              <div key={i} className="glass-surface" style={{display: 'flex', alignItems: 'center', padding: '16px 24px', borderRadius: '12px', justifyContent: 'space-between'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
                  <MapPin size={20} className="text-sand" />
                  <div>
                    <h4 className="font-display" style={{fontSize: '20px'}}>{item.name}</h4>
                    <p style={{fontSize: '14px', color: 'var(--text-secondary)'}}>{item.location}</p>
                  </div>
                </div>
                <span className="font-mono text-secondary" style={{fontSize: '12px'}}>
                  {new Date(item.timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
