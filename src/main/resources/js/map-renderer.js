/**
 * Manages the map display and interactions
 */
class MapRenderer {
    constructor(stationDataManager) {
        this.stationDataManager = stationDataManager;
        this.map = null;
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
        const centreStation = this.stationDataManager.getStation('Centre');
        this.map = L.map(mapEl).setView([
            centreStation.Latitude,
            centreStation.Longitude
        ], 10);

        this._addControls();
        this._addTileLayer();
        this._addAirstrip();
        this._addStationMarkers();
    }

    /**
     * Adds map controls
     * @private
     */
    _addControls() {
        L.control.scale({ maxWidth: 300 }).addTo(this.map);
        L.control.resetView({}).addTo(this.map);
    }

    /**
     * Adds the tile layer (satellite imagery)
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
     * Adds station markers to the map
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
                    fillColor: '#E70068',
                    fillOpacity: 0.9
                }
            ).bindTooltip(station.Label, {
                permanent: false,
                direction: "right",
                offset: [10, 0],
                opacity: 0.8
            }).addTo(this.map);

            station.marker = marker;
        });

        // Remove airstrip marker if it was added as a circle
        const airstripMarker = this.stationDataManager.getStation('Airstrip')?.marker;
        if (airstripMarker && airstripMarker._latlng) {
            this.map.removeLayer(airstripMarker);
        }
    }

    /**
     * Resets all tooltips on the map
     */
    resetTooltips() {
        if (!this.map) return;
        this.map.eachLayer((layer) => {
            if (layer.options.pane === "tooltipPane") layer.removeFrom(this.map);
        });
    }

    /**
     * Resets map view to the default centre and zoom
     */
    resetView() {
        if (!this.map) return;
        const centreStation = this.stationDataManager.getStation('Centre');
        this.map.flyTo([
            centreStation.Latitude,
            centreStation.Longitude
        ], 10, { animate: true, duration: 0.5 });
    }

    /**
     * Zooms to a specific station
     * @param {string} stationId - Station label/ID
     */
    zoomToStation(stationId) {
        if (!this.map) return;
        const station = this.stationDataManager.getStation(stationId);
        if (!station) return;

        this.map.flyTo(
            [station.Latitude, station.Longitude],
            13,
            { animate: true, duration: 0.5 }
        );

        if (station.marker) {
            this.resetTooltips();
            if (station.marker.openTooltip) {
                station.marker.openTooltip();
            }
        }
    }

    /**
     * Gets the map instance
     * @returns {L.Map} Leaflet map instance
     */
    getMap() {
        return this.map;
    }
}
