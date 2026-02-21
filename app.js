// ── State ──────────────────────────────────────────────────────────
let map = null;
let marker = null;
let mapsReady = false;
let pendingMapUpdate = null;

// ── Google Maps Callback ───────────────────────────────────────────
// Called automatically by the Maps JS API once it finishes loading.
window.initMap = function () {
  mapsReady = true;
  if (pendingMapUpdate) {
    updateMap(pendingMapUpdate.lat, pendingMapUpdate.lng, pendingMapUpdate.label);
    pendingMapUpdate = null;
  }
};

// ── UI Helpers ─────────────────────────────────────────────────────
function showLoading() {
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('error-box').classList.add('hidden');
  document.getElementById('results').classList.add('hidden');
}

function hideLoading() {
  document.getElementById('loading').classList.add('hidden');
}

function showError(msg) {
  hideLoading();
  document.getElementById('error-msg').textContent = msg;
  document.getElementById('error-box').classList.remove('hidden');
}

function setField(id, value) {
  document.getElementById(id).textContent = value || '—';
}

// Convert ISO 3166-1 alpha-2 country code to flag emoji
function countryFlag(code) {
  if (!code || code.length !== 2) return '';
  return [...code.toUpperCase()]
    .map(c => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

// ── Map ────────────────────────────────────────────────────────────
function updateMap(lat, lng, label) {
  if (!mapsReady) {
    pendingMapUpdate = { lat, lng, label };
    return;
  }

  if (lat == null || lng == null) return;

  const position = { lat: parseFloat(lat), lng: parseFloat(lng) };

  if (!map) {
    map = new google.maps.Map(document.getElementById('map'), {
      center: position,
      zoom: 11,
      styles: DARK_MAP_STYLES,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });
    marker = new google.maps.Marker({
      position,
      map,
      title: label,
      animation: google.maps.Animation.DROP,
    });
  } else {
    map.panTo(position);
    map.setZoom(11);
    marker.setPosition(position);
    marker.setTitle(label);
    marker.setAnimation(google.maps.Animation.DROP);
  }
}

// ── Core Lookup ────────────────────────────────────────────────────
async function lookupIP(ip) {
  showLoading();

  try {
    const url = ip
      ? `/api/lookup?ip=${encodeURIComponent(ip)}`
      : '/api/lookup';

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Failed to look up IP address.');
      return;
    }

    displayResults(data);
  } catch {
    showError('Network error. Please check your connection and try again.');
  }
}

function displayResults(data) {
  hideLoading();

  document.getElementById('result-ip').textContent = data.ip;
  document.getElementById('result-flag').textContent = countryFlag(data.country_code);

  setField('r-city',     data.city);
  setField('r-region',   data.region);
  setField('r-country',  data.country);
  setField('r-isp',      data.isp);
  setField('r-timezone', data.timezone);

  if (data.latitude != null && data.longitude != null) {
    const lat = parseFloat(data.latitude).toFixed(4);
    const lng = parseFloat(data.longitude).toFixed(4);
    setField('r-coords', `${lat}, ${lng}`);
  } else {
    setField('r-coords', 'Unavailable');
  }

  document.getElementById('results').classList.remove('hidden');

  const locationLabel = [data.city, data.country].filter(Boolean).join(', ');
  updateMap(data.latitude, data.longitude, locationLabel);
}

// ── Event Listeners ────────────────────────────────────────────────
document.getElementById('lookup-btn').addEventListener('click', () => {
  const ip = document.getElementById('ip-input').value.trim();
  if (!ip) { showError('Please enter an IP address to look up.'); return; }
  lookupIP(ip);
});

document.getElementById('detect-btn').addEventListener('click', () => {
  document.getElementById('ip-input').value = '';
  lookupIP(null);
});

document.getElementById('ip-input').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const ip = e.target.value.trim();
  if (!ip) { showError('Please enter an IP address to look up.'); return; }
  lookupIP(ip);
});

// ── Google Maps Dark Theme Styles ──────────────────────────────────
const DARK_MAP_STYLES = [
  { elementType: 'geometry',            stylers: [{ color: '#1a2540' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#8fa3c0' }] },
  { elementType: 'labels.text.stroke',  stylers: [{ color: '#111827' }] },
  { featureType: 'administrative',      elementType: 'geometry',              stylers: [{ color: '#2a3a5a' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke',   stylers: [{ color: '#3b5080' }] },
  { featureType: 'administrative.province', elementType: 'geometry.stroke',  stylers: [{ color: '#2a3a5a' }] },
  { featureType: 'landscape.man_made',  elementType: 'geometry.stroke',      stylers: [{ color: '#243352' }] },
  { featureType: 'landscape.natural',   elementType: 'geometry',             stylers: [{ color: '#0f1e38' }] },
  { featureType: 'poi',                 elementType: 'geometry',             stylers: [{ color: '#1a2a45' }] },
  { featureType: 'poi',                 elementType: 'labels.text.fill',     stylers: [{ color: '#5a7a9a' }] },
  { featureType: 'poi',                 elementType: 'labels.text.stroke',   stylers: [{ color: '#111827' }] },
  { featureType: 'poi.park',            elementType: 'geometry.fill',        stylers: [{ color: '#0d2137' }] },
  { featureType: 'poi.park',            elementType: 'labels.text.fill',     stylers: [{ color: '#2e6070' }] },
  { featureType: 'road',               elementType: 'geometry',              stylers: [{ color: '#243352' }] },
  { featureType: 'road',               elementType: 'labels.text.fill',      stylers: [{ color: '#7a96b8' }] },
  { featureType: 'road',               elementType: 'labels.text.stroke',    stylers: [{ color: '#111827' }] },
  { featureType: 'road.highway',       elementType: 'geometry',              stylers: [{ color: '#1e4060' }] },
  { featureType: 'road.highway',       elementType: 'geometry.stroke',       stylers: [{ color: '#173248' }] },
  { featureType: 'road.highway',       elementType: 'labels.text.fill',      stylers: [{ color: '#90c0cc' }] },
  { featureType: 'road.highway',       elementType: 'labels.text.stroke',    stylers: [{ color: '#0a1828' }] },
  { featureType: 'transit',            elementType: 'labels.text.fill',      stylers: [{ color: '#7a96b8' }] },
  { featureType: 'transit',            elementType: 'labels.text.stroke',    stylers: [{ color: '#111827' }] },
  { featureType: 'transit.line',       elementType: 'geometry.fill',         stylers: [{ color: '#1a2a45' }] },
  { featureType: 'transit.station',    elementType: 'geometry',              stylers: [{ color: '#253450' }] },
  { featureType: 'water',              elementType: 'geometry',              stylers: [{ color: '#060e1e' }] },
  { featureType: 'water',              elementType: 'labels.text.fill',      stylers: [{ color: '#2e5560' }] },
];
