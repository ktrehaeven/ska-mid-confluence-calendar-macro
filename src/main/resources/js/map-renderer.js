/**
 * Manages the map display and interactions
 */
class MapRenderer {
    constructor(stationDataManager, onMarkerClick = null) {
        this.stationDataManager = stationDataManager;
        this.map = null;
        this.onMarkerClick = onMarkerClick;
        this.isInitialized = false;
    }

    /**
     * Initializes the map in the given wrapper element
     * @param {HTMLElement} wrapper - Container element for the map
     */
    init(wrapper) {
        const mapEl = wrapper.querySelector('.map');
        if (!mapEl || this.isInitialized) return;
        this.isInitialized = true;

        // Initialize Leaflet map
        const centreStation = this.stationDataManager.getStation('S8-1');
        this.map = L.map(mapEl).setView([
            centreStation.Latitude,
            centreStation.Longitude
        ], 13);

        this._addControls();
        this._addTileLayer();
        this._addAirstrip();
        this._addStationMarkers();
    }

    /**
         * Adds scale and reset view controls to the map
         * @private
         */
    _addControls() {
        L.control.scale({ maxWidth: 300 }).addTo(this.map);
        L.control.resetView({}).addTo(this.map);
    }

    /**
     * Adds the Esri satellite imagery tile layer
     * @private
     */
    _addTileLayer() {
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            minZoom: 2,
            maxZoom: 17,
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        }).addTo(this.map);
    }

    /**
     * Adds the airstrip polyline
     * @private
     */
    _addAirstrip() {
        const airstripPolyline = L.polyline([
            ["-26.84110", "116.73869"],
            ["-26.84114", "116.74569"],
            ["-26.84114", "116.75297"]
        ], {
            color: 'black',
            weight: 5,
            opacity: 0.7
        }).bindTooltip("Airstrip", {
            permanent: false,
            direction: "top",
            opacity: 0.8
        }).addTo(this.map);

        // Store airstrip marker reference
        const airstripData = this.stationDataManager.getStation('Airstrip');
        if (airstripData) {
            airstripData.marker = airstripPolyline;
        }
    }

    /**
     * Adds a circle marker for each station (excluding Airstrip and Centre)
     * Markers fire the onMarkerClick callback when clicked
     * @private
     */
    _addStationMarkers() {
        Object.entries(this.stationDataManager.stationData).forEach(([key, station]) => {
            if (station.Label === 'Airstrip' || station.Label === 'Centre') return;

            const marker = L.circleMarker(
                [station.Latitude, station.Longitude],
                {
                    radius: 8,
                    color: '#070068',
                    fillColor: '#ffffff',
                    fillOpacity: 0.8
                }
            ).bindTooltip(station.Label, {
                permanent: false,
                direction: "right",
                offset: [10, 0],
                opacity: 0.8
            }).addTo(this.map);

            marker.on('click', () => {
                if (this.onMarkerClick) this.onMarkerClick(key);
            });

            station.marker = marker;
        });

        // Remove airstrip marker if it was added as a circle
        const airstripMarker = this.stationDataManager.getStation('Airstrip')?.marker;
        if (airstripMarker && airstripMarker._latlng) {
            this.map.removeLayer(airstripMarker);
        }
    }

    /**
     * Resets all tooltips to non-permanent hover behaviour
     */
    resetTooltips() {
        if (!this.map) return;
        this.stationDataManager.stationList.forEach(station => {
            const marker = this.stationDataManager.getStation(station.id)?.marker;
            if (!marker) return;
            marker.unbindTooltip();
            marker.bindTooltip(station.id, {
                permanent: false,
                direction: "right",
                offset: [10, 0],
                opacity: 0.8
            });
        });
    }

    /**
     * Resets map view to the default centre and zoom
     */
    resetView() {
        if (!this.map) return;
        const centreStation = this.stationDataManager.getStation('S8-1');
        this.map.flyTo([
            centreStation.Latitude,
            centreStation.Longitude
        ], 13, { animate: true, duration: 0.5 });
    }

    /**
     * Pans to a specific station
     * @param {string} stationId - Station label/ID
     */
    zoomToStation(stationId) {
        if (!this.map) return;
        const station = this.stationDataManager.getStation(stationId);
        if (!station) return;

        this.map.flyTo(
            [station.Latitude, station.Longitude],
            this.map.getZoom(),
            { animate: true, duration: 0.5 }
        );
    }

    /**
     * Highlights the given stations in pink and opens their tooltips
     * Resets all other highlighted stations back to white
     * @param {string[]} resources - Station IDs to highlight
     */
    highlightStations(resources) {
        this.stationDataManager.stationList.forEach(station => {
            const marker = this.stationDataManager.getStation(station.id)?.marker;
            if (!marker) return;
            if (resources.some(r => r === station.id)) {
                marker.setStyle({ fillColor: '#E70068' });
                marker.openTooltip();
            } else if (marker.options.fillColor !== '#ffffff') {
                marker.setStyle({ fillColor: '#ffffff' });
            }
        });
    }

    /**
     * Opens a station's tooltip permanently so it persists on hover
     * @param {string[]} stations - Station IDs to make permanent
     */
    openTooltips(stations) {
        if (!stations) return;
        this.stationDataManager.stationList.forEach(station => {
            const marker = this.stationDataManager.getStation(station.id)?.marker;
            if (!marker) return;
            if (stations.some(s => s === station.id)) {
                marker.unbindTooltip();
                marker.bindTooltip(station.id, {
                    permanent: true,
                    direction: "right",
                    offset: [10, 0],
                    opacity: 0.8
                }).openTooltip();
            }
        });
    }
}

window.MapRenderer = MapRenderer;
