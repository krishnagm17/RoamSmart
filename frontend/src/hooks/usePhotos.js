import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

const getSevenDaysAgoTimestamp = () => {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date;
};

function compressImage(file, maxDim, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Compression failed'))),
          'image/jpeg',
          quality
        );
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function generateTripId(destination, startDate, endDate) {
  return btoa(`${destination}-${startDate}-${endDate}`)
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 20);
}

export function usePhotoUpload() {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const uploadPhoto = useCallback(async (file, metadata) => {
    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      const fullBlob = await compressImage(file, 1200, 0.85);
      const thumbBlob = await compressImage(file, 400, 0.7);

      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 8);
      const basePath = `${metadata.tripId || 'general'}/${metadata.dayNumber || 0}`;
      const fullPath = `${basePath}/${timestamp}-${randomId}.jpg`;
      const thumbPath = `${basePath}/${timestamp}-${randomId}-thumb.jpg`;

      // Upload Full Image
      const { error: fullUploadError } = await supabase.storage
        .from('trip-photos')
        .upload(fullPath, fullBlob, {
          contentType: 'image/jpeg',
        });
      if (fullUploadError) throw fullUploadError;
      setUploadProgress(40);

      // Get Full Image URL
      const { data: fullUrlData } = supabase.storage.from('trip-photos').getPublicUrl(fullPath);
      const imageUrl = fullUrlData.publicUrl;

      // Upload Thumb Image
      const { error: thumbUploadError } = await supabase.storage
        .from('trip-photos')
        .upload(thumbPath, thumbBlob, {
          contentType: 'image/jpeg',
        });
      if (thumbUploadError) throw thumbUploadError;
      setUploadProgress(80);

      // Get Thumb URL
      const { data: thumbUrlData } = supabase.storage.from('trip-photos').getPublicUrl(thumbPath);
      const thumbnailUrl = thumbUrlData.publicUrl;
      setUploadProgress(92);

      const photoDoc = {
        imageUrl,
        thumbnailUrl,
        tripId: metadata.tripId || '',
        destination: metadata.destination || '',
        dayNumber: metadata.dayNumber || 1,
        activityName: metadata.activityName || '',
        placeName: metadata.placeName || '',
        placeLocation: metadata.placeLocation || '',
        placeType: metadata.placeType || '',
        caption: metadata.caption || '',
        entryFee: metadata.entryFee || null,
        timings: metadata.timings || '',
        bestTimeToVisit: metadata.bestTimeToVisit || '',
        uploadedAt: new Date().toISOString(),
        tripStartDate: metadata.tripStartDate || '',
        tripEndDate: metadata.tripEndDate || '',
        uploaderName: 'Traveller',
        isVerifiedByUser: metadata.isVerifiedByUser || false,
        tags: metadata.tags || []
      };

      const { error: dbError } = await supabase.from('photos').insert([photoDoc]);
      if (dbError) throw dbError;

      setUploadProgress(100);
      setUploading(false);
      return { imageUrl, thumbnailUrl };
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadError(error.message || 'Upload failed. Please try again.');
      setUploading(false);
      throw error;
    }
  }, []);

  return { uploadPhoto, uploadProgress, uploading, uploadError, setUploadError };
}

export function useDayPhotos(destination, activities, tripId, dayNumber) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;

    const sevenDaysAgo = getSevenDaysAgoTimestamp().toISOString();
    
    const fetchDayPhotos = async () => {
      setLoading(true);
      const { data: allPhotos, error } = await supabase
        .from('photos')
        .select('*')
        .gte('uploadedAt', sevenDaysAgo)
        .order('uploadedAt', { ascending: false });

      if (error) {
        console.error('Day photos fetch error:', error);
        setLoading(false);
        return;
      }

      const filtered = (allPhotos || []).filter(p => {
        const isOwnPhoto = tripId && p.tripId === tripId && Number(p.dayNumber) === Number(dayNumber);
        
        const cleanDest = destination ? destination.split(',')[0].trim().toLowerCase() : '';
        const isPlaceMatch = cleanDest && (p.destination || '').toLowerCase().includes(cleanDest) && 
          activities && activities.some(act => {
            const actName = (act.name || '').toLowerCase();
            const photoPlace = (p.placeName || '').toLowerCase();
            return actName.includes(photoPlace) || photoPlace.includes(actName);
          });

        return isOwnPhoto || isPlaceMatch;
      });

      setPhotos(filtered);
      setLoading(false);
    };

    fetchDayPhotos();

    const channel = supabase.channel(`public:photos`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos' }, payload => {
        fetchDayPhotos();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [destination, activities, tripId, dayNumber]);

  return { photos, loading };
}

export function useGalleryPhotos() {
  const [allPhotos, setAllPhotos] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [destinations, setDestinations] = useState([]);

  const loadPhotos = useCallback(async (filterDestination = null) => {
    setLoading(true);
    const sevenDaysAgo = getSevenDaysAgoTimestamp().toISOString();

    try {
      const { data: results, error } = await supabase
        .from('photos')
        .select('*')
        .gte('uploadedAt', sevenDaysAgo)
        .order('uploadedAt', { ascending: false });

      if (error) throw error;

      // Filter by destination in JS
      const filtered = filterDestination && filterDestination !== 'All'
        ? (results || []).filter(p => p.destination === filterDestination)
        : (results || []);

      setAllPhotos(filtered);
      setPhotos(filtered.slice(0, 12));
      setPage(1);
      setHasMore(filtered.length > 12);

      // Extract unique destinations
      const destSet = new Set();
      (results || []).forEach(p => {
        if (p.destination) destSet.add(p.destination);
      });
      setDestinations(Array.from(destSet));
    } catch (error) {
      console.error('Gallery load error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    setLoading(true);
    const nextPage = page + 1;
    const nextPhotos = allPhotos.slice(0, nextPage * 12);
    setPhotos(nextPhotos);
    setPage(nextPage);
    setHasMore(allPhotos.length > nextPage * 12);
    setLoading(false);
  }, [allPhotos, page, hasMore, loading]);

  return { photos, loading, hasMore, destinations, loadPhotos, loadMore };
}
