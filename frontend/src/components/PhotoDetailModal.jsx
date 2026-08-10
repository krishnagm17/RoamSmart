import { motion, AnimatePresence } from 'framer-motion';

export default function PhotoDetailModal({ photo, isOpen, onClose }) {
  if (!photo || !isOpen) return null;

  function timeAgo(timestamp) {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - (timestamp.seconds ? timestamp.seconds * 1000 : new Date(timestamp).getTime())) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(timestamp.seconds ? timestamp.seconds * 1000 : timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function openInMaps() {
    const q = encodeURIComponent(`${photo.placeName}, ${photo.placeLocation}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank');
  }

  function savePhoto() {
    const a = document.createElement('a');
    a.href = photo.imageUrl;
    a.download = `${photo.placeName || 'travel'}-photo.jpg`;
    a.target = '_blank';
    a.click();
  }

  const entryFee = photo.entryFee;
  const entryFeeText = typeof entryFee === 'object' && entryFee
    ? `${entryFee.indian || ''}${entryFee.foreigner ? ' \u00b7 ' + entryFee.foreigner + ' (Foreigners)' : ''}${entryFee.note ? ' \u2014 ' + entryFee.note : ''}`
    : (entryFee || '');

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="photo-detail-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="photo-detail-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120) onClose();
            }}
          >
            <div className="photo-detail-drag-handle" />

            <button className="photo-detail-close" onClick={onClose} type="button" aria-label="Close">
              <i className="ti ti-x" aria-hidden="true" />
            </button>

            <div className="photo-detail-image-wrap">
              <img src={photo.imageUrl} alt={photo.placeName || 'Travel photo'} className="photo-detail-image" />
            </div>

            <div className="photo-detail-content">
              <h2 className="photo-detail-name">
                <i className="ti ti-map-pin" aria-hidden="true" />
                {photo.placeName || 'Unknown Place'}
              </h2>
              <p className="photo-detail-location">{photo.placeLocation || photo.destination || ''}</p>

              {(photo.placeType || (photo.tags && photo.tags.length > 0)) && (
                <div className="photo-detail-tags">
                  {photo.placeType && <span className="photo-detail-type-tag">{photo.placeType}</span>}
                  {(photo.tags || []).map((tag) => (
                    <span key={tag} className="photo-detail-tag">{tag}</span>
                  ))}
                </div>
              )}

              <div className="photo-detail-meta-row">
                {photo.dayNumber && <span className="photo-detail-day">Day {photo.dayNumber} of trip</span>}
                <span className="photo-detail-ago">{timeAgo(photo.uploadedAt)}</span>
              </div>

              {photo.caption && (
                <blockquote className="photo-detail-caption">
                  <span className="caption-quote">{'\u201c'}</span>
                  {photo.caption}
                  <span className="caption-quote">{'\u201d'}</span>
                </blockquote>
              )}

              {(photo.timings || entryFeeText || photo.bestTimeToVisit) && (
                <div className="photo-detail-info-section">
                  {photo.timings && (
                    <div className="photo-detail-info-row">
                      <i className="ti ti-clock" aria-hidden="true" />
                      <span>{photo.timings}</span>
                    </div>
                  )}
                  {entryFeeText && (
                    <div className="photo-detail-info-row">
                      <i className="ti ti-ticket" aria-hidden="true" />
                      <span>{entryFeeText}</span>
                    </div>
                  )}
                  {photo.bestTimeToVisit && (
                    <div className="photo-detail-info-row">
                      <i className="ti ti-sun" aria-hidden="true" />
                      <span>{photo.bestTimeToVisit}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="photo-detail-actions">
                <button className="primary-button photo-detail-btn" onClick={openInMaps} type="button">
                  <i className="ti ti-map-search" aria-hidden="true" />
                  View on Maps
                </button>
                <button className="secondary-button photo-detail-btn" onClick={savePhoto} type="button">
                  <i className="ti ti-download" aria-hidden="true" />
                  Save Photo
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
