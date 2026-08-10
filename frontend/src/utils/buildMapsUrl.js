const genericStopNames = new Set([
  "break",
  "check in",
  "check-in",
  "check out",
  "check-out",
  "free time",
  "leisure",
  "rest",
  "return",
  "travel"
]);

export function getGoogleMapsStops(activities = [], destination = "") {
  return activities
    .filter((activity, index) => {
      const name = activity?.name?.trim();
      const type = String(activity?.type || "").toLowerCase();
      const normalizedName = String(name || "").toLowerCase();
      const isEndpoint = index === 0 || index === activities.length - 1;

      if (!name || name.length <= 2) return false;
      if (genericStopNames.has(normalizedName)) return false;
      if (type === "hotel" && !isEndpoint) return false;

      return true;
    })
    .map((activity) => `${activity.name.trim()}, ${destination}`);
}

export function buildGoogleMapsUrl(activities, destination, travelMode) {
  const stops = getGoogleMapsStops(activities, destination);

  if (stops.length === 0) return null;

  if (stops.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stops[0])}`;
  }

  const trimmed = stops.slice(0, 10);
  const origin = encodeURIComponent(trimmed[0]);
  const dest = encodeURIComponent(trimmed[trimmed.length - 1]);
  const waypoints = trimmed
    .slice(1, -1)
    .map((stop) => encodeURIComponent(stop))
    .join("|");

  let url = "https://www.google.com/maps/dir/?api=1";
  url += `&origin=${origin}`;
  if (waypoints) url += `&waypoints=${waypoints}`;
  url += `&destination=${dest}`;
  url += `&travelmode=${travelMode}`;

  return url;
}

export function buildGoogleMapsSearchUrl(activity, destination) {
  const query = `${activity?.name?.trim() || ""}, ${destination}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
