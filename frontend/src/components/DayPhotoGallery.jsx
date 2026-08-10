import { useState } from 'react';
import { useDayPhotos } from '../hooks/usePhotos';
import PhotoDetailModal from './PhotoDetailModal';

export default function DayPhotoGallery({ tripId, dayNumber, destination, formData, activities, onAddPhoto }) {
  const { photos, loading } = useDayPhotos(destination, activities, tripId, dayNumber);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  if (loading) {
    return (
      <div className="day-photo-gallery day-photo-loading">
        <div className="day-photo-loading-pulse" />
        <span>Loading photos...</span>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="day-photo-gallery day-photo-empty">
        <i className="ti ti-camera" aria-hidden="true" />
        <p>No photos yet</p>
        <span>Be the first to capture memories from Day {dayNumber}</span>
        <button
          className="day-photo-add-btn"
          onClick={() => onAddPhoto?.(dayNumber)}
          type="button"
        >
          <i className="ti ti-plus" aria-hidden="true" />
          Add your photo
        </button>
      </div>
    );
  }

  return (
    <div className="day-photo-gallery">
      <div className="day-photo-strip">
        {photos.map((photo) => (
          <button
            key={photo.id}
            className="day-photo-thumb"
            onClick={() => setSelectedPhoto(photo)}
            type="button"
            aria-label={`View photo of ${photo.placeName || 'place'}`}
          >
            <img
              src={photo.thumbnailUrl || photo.imageUrl}
              alt={photo.placeName || 'Travel photo'}
              loading="lazy"
            />
          </button>
        ))}
        <button
          className="day-photo-add-thumb"
          onClick={() => onAddPhoto?.(dayNumber)}
          type="button"
          aria-label="Add photo"
        >
          <i className="ti ti-plus" aria-hidden="true" />
        </button>
      </div>
      <p className="day-photo-count">
        {photos.length} photo{photos.length !== 1 ? 's' : ''} from Day {dayNumber}
      </p>

      <PhotoDetailModal
        photo={selectedPhoto}
        isOpen={!!selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
      />
    </div>
  );
}
