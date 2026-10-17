// 1. Initialize map frame over Ontario
const map = L.map('map').setView([45.0, -80.0], 6);

// 2. Load standard, unrestricted Esri Street Map tiles (FULLY INTENDED COMPLETE PATH)
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, USGS'
}).addTo(map);

// 3. Request and track device GPS coordinate location marker
if (navigator.geolocation) {
    navigator.geolocation.watchPosition((position) => {
        const userLocation = [position.coords.latitude, position.coords.longitude];
        if (window.userMarker) {
            window.userMarker.setLatLng(userLocation);
        } else {
            window.userMarker = L.circleMarker(userLocation, {
                radius: 8, color: '#0078FF', fillColor: '#0078FF', fillOpacity: 1
            }).addTo(map).bindPopup("You are here").openPopup();
            map.setView(userLocation, 12);
        }
    }, (err) => {
        console.error("GPS tracking access failed: ", err.message);
    }, { enableHighAccuracy: true });
}

// Visual layer memory holders
let activeWmuLayer = null;
let activeCrownLayer = null;

// Ray-Casting Algorithm: Valid loop logic checking containment inside a single multi-coordinate sequence array
function isPointInPolygon(point, polygonCoordinates) {
    const x = point[1]; // Longitude
    const y = point[0]; // Latitude
    let inside = false;
    
    // Process outer boundary ring loop
    const ring = polygonCoordinates[0]; 
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function searchWMU() {
    if (typeof wmuData === 'undefined' || typeof crownData === 'undefined') {
        return alert("Data profiles are missing from folder directory.");
    }

    const rawInput = document.getElementById('wmu-input').value.trim();
    if (!rawInput) return alert("Please enter a WMU number.");
    
    const cleanNumber = rawInput.toUpperCase().replace("WMU", "").trim();

    // Clear old visual selections from the screen entirely
    if (activeWmuLayer) map.removeLayer(activeWmuLayer);
    if (activeCrownLayer) map.removeLayer(activeCrownLayer);

    // Step A: STRICT EXACT MATCH - Isolate ONLY the exact single blue boundary line matching your search string
    let targetWmuFeature = null;
    activeWmuLayer = L.geoJSON(wmuData, {
        filter: (feature) => {
            if (!feature.properties) return false;
            
            // Find the label column Mapshaper created (checking standard variations)
            const wmuLabel = (feature.properties.NAME || feature.properties.OFFICIAL_NAME || feature.properties.WMU_ID || "").toString();
            const cleanWmuLabel = wmuLabel.toUpperCase().replace("WMU", "").trim();
            
            // STRICT LOGICAL EQUAL TEST: Only returns true if the label is exactly what you typed
            const match = (cleanWmuLabel === cleanNumber);
            if (match) targetWmuFeature = feature; 
            return match;
        },
        style: { 
            color: '#0055FF',     // Bold Blue Outline for target area
            weight: 5,            
            fillColor: '#0055FF', 
            fillOpacity: 0.02     
        }
    });

    if (activeWmuLayer.getLayers().length === 0 || !targetWmuFeature) {
        return alert(`Could not locate precise boundary matching WMU unit "${cleanNumber}".`);
    }

    // Paint the single target blue WMU line on the map
    activeWmuLayer.addTo(map);
    
    const wmuBounds = activeWmuLayer.getBounds();
    map.fitBounds(wmuBounds);

    // Step B: Point-In-Polygon Filtering for Crown Land (Unhandles other province blocks)
    activeCrownLayer = L.geoJSON(crownData, {
        filter: (feature) => {
            if (!feature.geometry || !feature.geometry.coordinates) return false;
            try {
                // Pin down an explicit coordinate pair to check against the polygon boundaries
                let samplePoint = null;
                if (feature.geometry.type === "Polygon") {
                    samplePoint = feature.geometry.coordinates[0][0]; 
                } else if (feature.geometry.type === "MultiPolygon") {
                    samplePoint = feature.geometry.coordinates[0][0][0];
                }
                
                if (!samplePoint) return false;

                // Flip coordinates to match standard Leaflet [lat, lng] point comparisons
                const latLngPoint = [samplePoint[1], samplePoint[0]];

                // Verify containment geometry directly against the target WMU
                if (targetWmuFeature.geometry.type === "Polygon") {
                    return isPointInPolygon(latLngPoint, targetWmuFeature.geometry.coordinates);
                } else if (targetWmuFeature.geometry.type === "MultiPolygon") {
                    return targetWmuFeature.geometry.coordinates.some(polyCoords => isPointInPolygon(latLngPoint, polyCoords));
                }
                return false;
            } catch (e) {
                return false; 
            }
        },
        style: (feature) => {
            const designation = feature.properties.DESIGNATIO || "";
            if (designation.includes("Provincial Park")) return { color: '#E74C3C', weight: 1, fillColor: '#E74C3C', fillOpacity: 0.4 };
            return { color: '#2ECC71', weight: 1, fillColor: '#2ECC71', fillOpacity: 0.4 };
        },
        onEachFeature: (feature, layer) => {
            const name = feature.properties.NAME_ENG || "Unnamed Crown Land";
            const id = feature.properties.POLICY_IDE || "N/A";
            const type = feature.properties.DESIGNATIO || "General Use Area";
            layer.bindPopup(`<b>${name}</b><br>ID: ${id}<br>Type: ${type}`);
        }
    }).addTo(map);
}
