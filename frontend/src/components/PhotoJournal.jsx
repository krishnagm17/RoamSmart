import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useGalleryPhotos } from '../hooks/usePhotos';
import PhotoCard from './PhotoCard';
import PhotoDetailModal from './PhotoDetailModal';
import PhotoUploader from './PhotoUploader';
import { Search, Camera, Plus, ImageIcon } from 'lucide-react';
import './LuxuryForms.css';

export default function PhotoJournal({ showToast }) {
  const { photos, loading, hasMore, destinations, loadPhotos, loadMore } = useGalleryPhotos();
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const searchTimer = useRef(null);

  useEffect(() => {
    loadPhotos(null, true);
  }, []);

  function handleFilterChange(dest) {
    setActiveFilter(dest);
    setSearchQuery('');
    loadPhotos(dest === 'All' ? null : dest, true);
  }

  function handleSearchChange(value) {
    setSearchQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {}, 300);
  }

  const filteredPhotos = searchQuery.trim()
    ? photos.filter((p) => {
        const q = searchQuery.toLowerCase();
        return (
          (p.placeName || '').toLowerCase().includes(q) ||
          (p.destination || '').toLowerCase().includes(q) ||
          (p.placeLocation || '').toLowerCase().includes(q) ||
          (p.tags || []).some((t) => t.toLowerCase().includes(q))
        );
      })
    : photos;

  return (
    <div className="luxury-page-wrapper" style={{maxWidth: '1200px'}}>
      <header className="luxury-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', textAlign: 'left', marginBottom: '60px'}}>
        <div>
          <span className="luxury-kicker">ARCHIVE</span>
          <h1 className="luxury-title font-display">Photo <span className="italic text-sand">Journal</span></h1>
          <p className="luxury-subtitle">Memories captured from the road.</p>
        </div>
        <button className="btn-sand" onClick={() => setUploaderOpen(true)}>
          <Plus size={18} /> Compose Entry
        </button>
      </header>

      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', gap: '24px'}}>
        <div style={{position: 'relative', width: '300px'}}>
          <Search size={18} style={{position: 'absolute', top: '12px', left: '12px', color: 'var(--text-secondary)'}} />
          <input 
            type="text" 
            className="luxury-input" 
            style={{width: '100%', paddingLeft: '40px', fontSize: '14px', borderBottomColor: 'rgba(255,255,255,0.1)'}}
            placeholder="Search moments..." 
            value={searchQuery} 
            onChange={(e) => handleSearchChange(e.target.value)} 
          />
        </div>

        {destinations.length > 0 && (
          <div style={{display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px', WebkitOverflowScrolling: 'touch'}}>
            <button className={`luxury-chip ${activeFilter === 'All' ? 'selected' : ''}`} onClick={() => handleFilterChange('All')}>All</button>
            {destinations.map((dest) => (
              <button key={dest} className={`luxury-chip ${activeFilter === dest ? 'selected' : ''}`} onClick={() => handleFilterChange(dest)}>{dest}</button>
            ))}
          </div>
        )}
      </div>

      {loading && photos.length === 0 ? (
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '40vh'}}>
          <div style={{width: '40px', height: '40px', border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite'}} />
          <p className="font-mono mt-4" style={{letterSpacing: '2px', fontSize: '11px', color: 'var(--text-secondary)'}}>LOADING GALLERY</p>
        </div>
      ) : filteredPhotos.length === 0 ? (
        <div className="glass-surface" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '40vh', borderRadius: '24px', textAlign: 'center'}}>
          <ImageIcon size={48} className="text-sand" style={{marginBottom: '24px', opacity: 0.5}} />
          <h3 className="font-display italic" style={{fontSize: '32px', marginBottom: '12px'}}>The journal is empty.</h3>
          <p className="luxury-subtitle" style={{marginBottom: '32px'}}>Be the first to leave a mark from your journey.</p>
          <button className="btn-outline-sand" onClick={() => setUploaderOpen(true)}>
            <Camera size={18} /> Add Photograph
          </button>
        </div>
      ) : (
        <>
          <div style={{columns: '3 300px', columnGap: '24px'}}>
            {filteredPhotos.map((photo) => (
              <div key={photo.id} style={{breakInside: 'avoid', marginBottom: '24px'}}>
                <PhotoCard photo={photo} onClick={setSelectedPhoto} />
              </div>
            ))}
          </div>
          {hasMore && !searchQuery && (
            <div style={{display: 'flex', justifyContent: 'center', marginTop: '60px'}}>
              <button className="btn-outline-sand" onClick={() => loadMore(activeFilter === 'All' ? null : activeFilter)} disabled={loading}>
                {loading ? 'Loading...' : 'Load more photos'}
              </button>
            </div>
          )}
        </>
      )}

      <PhotoUploader isOpen={uploaderOpen} onClose={() => { setUploaderOpen(false); loadPhotos(activeFilter === 'All' ? null : activeFilter, true); }} showToast={showToast} />
      <PhotoDetailModal photo={selectedPhoto} isOpen={!!selectedPhoto} onClose={() => setSelectedPhoto(null)} />
    </div>
  );
}
