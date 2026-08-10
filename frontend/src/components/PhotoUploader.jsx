import { useState, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePhotoUpload, generateTripId } from '../hooks/usePhotos';
import api from '../api.js';

export default function PhotoUploader({ isOpen, onClose, tripId, destination, formData, dayNumber: initialDay, showToast }) {
  const [step, setStep] = useState(1);
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [activePreview, setActivePreview] = useState(0);
  const [identifying, setIdentifying] = useState(false);
  const [identified, setIdentified] = useState(false);
  const [identifyResult, setIdentifyResult] = useState(null);

  const [placeName, setPlaceName] = useState('');
  const [placeLocation, setPlaceLocation] = useState('');
  const [placeType, setPlaceType] = useState('');
  const [caption, setCaption] = useState('');
  const [dayNumber, setDayNumber] = useState(initialDay || 1);
  const [timings, setTimings] = useState('');
  const [entryFee, setEntryFee] = useState('');
  const [bestTime, setBestTime] = useState('');
  const [tags, setTags] = useState([]);
  const [regeneratingCaption, setRegeneratingCaption] = useState(false);

  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const { uploadPhoto, uploadProgress, uploading, uploadError, setUploadError } = usePhotoUpload();

  const activeTrip = useMemo(() => {
    if (formData) {
      return {
        destination: destination || formData.destination,
        startDate: formData.startDate,
        endDate: formData.endDate,
        days: formData.days
      };
    }
    try {
      const saved = JSON.parse(localStorage.getItem('roam_saved_trips') || '[]');
      if (saved.length > 0) {
        const first = saved[0];
        return {
          destination: first.formData?.destination || first.destination || '',
          startDate: first.formData?.startDate || first.startDate || '',
          endDate: first.formData?.endDate || first.endDate || '',
          days: first.days || []
        };
      }
    } catch { /* ignore */ }
    return null;
  }, [formData, destination]);

  const canUpload = useCallback(() => {
    return true;
  }, []);

  function getItineraryDays() {
    return activeTrip?.days || null;
  }

  const itineraryDays = getItineraryDays();
  const maxDays = itineraryDays ? itineraryDays.length : 7;

  function handleFiles(selectedFiles) {
    const fileArr = Array.from(selectedFiles).slice(0, 5);
    if (fileArr.length === 0) return;
    setFiles(fileArr);
    const newPreviews = fileArr.map((f) => URL.createObjectURL(f));
    setPreviews(newPreviews);
    setActivePreview(0);
    identifyPlace(fileArr[0]);
  }

  async function identifyPlace(file) {
    setIdentifying(true);
    setStep(2);
    try {
      const fd = new FormData();
      fd.append('image', file, 'photo.jpg');
      const res = await api.post('/api/identify-landmark', fd);
      const data = res.data;
      if (data.identified) {
        setIdentified(true);
        setIdentifyResult(data);
        setPlaceName(data.name || '');
        setPlaceLocation(data.location || '');
        setPlaceType(data.type || '');
        setCaption(data.description || '');
        setTimings(data.timings || '');
        setEntryFee(data.entry_fee || '');
        setBestTime(data.best_time_to_visit || '');
        setTags(data.type ? [data.type] : []);
      } else {
        setIdentified(false);
        setIdentifyResult(data);
      }
    } catch (err) {
      console.error('Identify failed:', err);
      setIdentified(false);
      setIdentifyResult({ identified: false, error: 'Could not identify. Enter details manually.' });
    } finally {
      setIdentifying(false);
    }
  }

  async function regenerateCaption() {
    if (!placeName) return;
    setRegeneratingCaption(true);
    try {
      const res = await api.post('/api/generate-caption', { placeName, placeLocation });
      setCaption(res.data.caption || caption);
    } catch (err) {
      console.error('Caption regeneration failed:', err);
    } finally {
      setRegeneratingCaption(false);
    }
  }

  async function handleUpload() {
    if (!placeName.trim()) {
      setUploadError('Place name is required');
      return;
    }
    const effectiveTripId = tripId || (activeTrip ? generateTripId(
      activeTrip.destination,
      activeTrip.startDate,
      activeTrip.endDate
    ) : 'general');
    try {
      for (const file of files) {
        await uploadPhoto(file, {
          tripId: effectiveTripId,
          destination: activeTrip?.destination || '',
          dayNumber: Number(dayNumber),
          placeName: placeName.trim(),
          placeLocation: placeLocation.trim(),
          placeType,
          caption,
          entryFee,
          timings,
          bestTimeToVisit: bestTime,
          tripStartDate: activeTrip?.startDate || '',
          tripEndDate: activeTrip?.endDate || '',
          isVerifiedByUser: true,
          tags
        });
      }
      showToast?.('Photo added to your travel journal! 🎉', 'success');
      handleClose();
    } catch (err) {
      // Error already set by usePhotoUpload
    }
  }

  function handleClose() {
    if (uploading) return;
    setStep(1);
    setFiles([]);
    setPreviews([]);
    setPlaceName('');
    setPlaceLocation('');
    setPlaceType('');
    setCaption('');
    setTimings('');
    setEntryFee('');
    setBestTime('');
    setTags([]);
    setIdentified(false);
    setIdentifyResult(null);
    setUploadError(null);
    onClose?.();
  }

  function handleBack() {
    if (uploading) return;
    setStep(1);
    setFiles([]);
    setPreviews([]);
    setPlaceName('');
    setPlaceLocation('');
    setPlaceType('');
    setCaption('');
    setTimings('');
    setEntryFee('');
    setBestTime('');
    setTags([]);
    setIdentified(false);
    setIdentifyResult(null);
    setUploadError(null);
  }

  if (!isOpen) return null;

  if (!canUpload()) {
    return (
      <div className="photo-uploader-overlay" onClick={handleClose}>
        <div className="photo-uploader-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="photo-uploader-drag-handle" />
          <div className="photo-uploader-restricted">
            <i className="ti ti-calendar-off" aria-hidden="true" />
            <h3>Upload Window Closed</h3>
            <p>Photo uploads are available for 7 days from your trip start date. Your upload window has closed.</p>
            <button className="secondary-button" onClick={handleClose} type="button">Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        className="photo-uploader-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
      >
        <motion.div
          className="photo-uploader-sheet"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="photo-uploader-drag-handle" />

          <button className="photo-uploader-close" onClick={handleClose} type="button" aria-label="Close" disabled={uploading}>
            <i className="ti ti-x" aria-hidden="true" />
          </button>

          {step === 2 && !identifying && (
            <button className="photo-uploader-back" onClick={handleBack} type="button" aria-label="Back" disabled={uploading}>
              <i className="ti ti-arrow-left" aria-hidden="true" />
            </button>
          )}

          {step === 1 && (
            <div className="photo-uploader-step">
              <h2>Add Travel Photo</h2>
              <p className="photo-uploader-sub">Share your travel memory</p>
              <div className="photo-uploader-options">
                <button className="photo-uploader-option-btn" onClick={() => cameraRef.current?.click()} type="button">
                  <i className="ti ti-camera" aria-hidden="true" />
                  <span>Take Photo</span>
                </button>
                <button className="photo-uploader-option-btn" onClick={() => galleryRef.current?.click()} type="button">
                  <i className="ti ti-photo" aria-hidden="true" />
                  <span>Choose from Gallery</span>
                </button>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
              <input ref={galleryRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
            </div>
          )}

          {step === 2 && (
            <div className="photo-uploader-step">
              {identifying ? (
                <div className="photo-uploader-identifying">
                  {previews[0] && (
                    <div className="photo-uploader-preview-wrap">
                      <img src={previews[0]} alt="Preview" className="photo-uploader-preview" />
                      <div className="photo-uploader-scan-overlay">
                        <div className="photo-uploader-scan-line" />
                      </div>
                    </div>
                  )}
                  <div className="photo-uploader-identifying-text">
                    <div className="photo-uploader-pulse-dots"><span /><span /><span /></div>
                    <p>AI is identifying this place...</p>
                  </div>
                </div>
              ) : (
                <div className="photo-uploader-form">
                  <div className="photo-uploader-status">
                    {identified ? (
                      <><i className="ti ti-circle-check" aria-hidden="true" /> Place identified!</>
                    ) : (
                      <><i className="ti ti-alert-triangle" aria-hidden="true" /> Couldn&apos;t identify place</>
                    )}
                  </div>

                  {previews.length > 1 && (
                    <div className="photo-uploader-previews">
                      {previews.map((p, i) => (
                        <img key={i} src={p} alt={`Preview ${i + 1}`} className={`photo-uploader-thumb-mini ${i === activePreview ? 'active' : ''}`} onClick={() => setActivePreview(i)} />
                      ))}
                    </div>
                  )}
                  {previews[activePreview] && (
                    <img src={previews[activePreview]} alt="Selected" className="photo-uploader-preview" />
                  )}

                  <div className="photo-uploader-fields">
                    <label className="photo-uploader-field">
                      <span>{identified ? 'Place Name' : 'Enter Place Name manually'}</span>
                      <div className="photo-uploader-input-wrap">
                        <input type="text" value={placeName} onChange={(e) => setPlaceName(e.target.value)} placeholder="Enter place name" />
                        <i className="ti ti-pencil" aria-hidden="true" />
                      </div>
                    </label>

                    <label className="photo-uploader-field">
                      <span>Location</span>
                      <div className="photo-uploader-input-wrap">
                        <input type="text" value={placeLocation} onChange={(e) => setPlaceLocation(e.target.value)} placeholder="City, State" />
                        <i className="ti ti-pencil" aria-hidden="true" />
                      </div>
                    </label>

                    <label className="photo-uploader-field">
                      <span>Day of Trip</span>
                      <div className="photo-uploader-day-selector">
                        {Array.from({ length: maxDays }, (_, i) => i + 1).map((d) => (
                          <button key={d} type="button" className={`photo-uploader-day-chip ${d === dayNumber ? 'active' : ''}`} onClick={() => setDayNumber(d)}>
                            Day {d}{itineraryDays && itineraryDays[d - 1]?.theme ? ` \u2014 ${itineraryDays[d - 1].theme.substring(0, 18)}${itineraryDays[d - 1].theme.length > 18 ? '\u2026' : ''}` : ''}
                          </button>
                        ))}
                      </div>
                    </label>

                    {identified && (
                      <label className="photo-uploader-field">
                        <span>AI Caption</span>
                        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write a caption..." rows={3} />
                        <button className="photo-uploader-regen-btn" onClick={regenerateCaption} disabled={regeneratingCaption || !placeName} type="button">
                          <i className="ti ti-sparkles" aria-hidden="true" />
                          {regeneratingCaption ? 'Generating...' : 'Regenerate Caption'}
                        </button>
                      </label>
                    )}
                  </div>

                  {uploadError && (
                    <div className="photo-uploader-error">
                      <i className="ti ti-alert-circle" aria-hidden="true" />
                      <span>{uploadError}</span>
                    </div>
                  )}

                  <button className="primary-button photo-uploader-submit" onClick={handleUpload} disabled={uploading || !placeName.trim()} type="button">
                    {uploading ? (<><i className="ti ti-loader" aria-hidden="true" /> Uploading... {uploadProgress}%</>) : (<><i className="ti ti-upload" aria-hidden="true" /> Upload Photo</>)}
                  </button>

                  {uploading && (
                    <div className="photo-uploader-progress-track">
                      <div className="photo-uploader-progress-fill" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
