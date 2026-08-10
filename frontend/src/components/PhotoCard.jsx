import { motion } from 'framer-motion';

export default function PhotoCard({ photo, onClick }) {
  function timeAgo(timestamp) {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - (timestamp.seconds ? timestamp.seconds * 1000 : new Date(timestamp).getTime())) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(timestamp.seconds ? timestamp.seconds * 1000 : timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  return (
    <motion.div
      className="photo-card"
      onClick={() => onClick?.(photo)}
      whileHover={{ y: -3 }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.(photo)}
    >
      <div className="photo-card-img-wrap">
        <img
          src={photo.thumbnailUrl || photo.imageUrl}
          alt={photo.placeName || 'Travel photo'}
          loading="lazy"
          className="photo-card-img"
        />
        {photo.dayNumber && (
          <span className="photo-card-day-badge">Day {photo.dayNumber}</span>
        )}
      </div>
      <div className="photo-card-info">
        <h4 className="photo-card-place">{photo.placeName || 'Unknown Place'}</h4>
        <p className="photo-card-location">
          <i className="ti ti-map-pin" aria-hidden="true" />
          {photo.placeLocation || photo.destination || ''}
        </p>
        <span className="photo-card-time">{timeAgo(photo.uploadedAt)}</span>
      </div>
    </motion.div>
  );
}
