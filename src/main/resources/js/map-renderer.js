/**
 * Manages the map display and interactions
 */
class MapRenderer {
    constructor(dishDataManager, onMarkerClick = null) {
        this.dishDataManager = dishDataManager;
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
        const centreDish = this.dishDataManager.getDish('SKA001');
        this.map = L.map(mapEl).setView([
            centreDish.Latitude,
            centreDish.Longitude
        ], 13);

        this._addControls();
        this._addTileLayer();
        this._addAirstrip();
        this._addDishMarkers();
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
            ["-30.693786", "21.461036"],
            ["-30.688743", "21.457668"],
            ["-30.683631", "21.454252"],
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
        const airstripData = this.dishDataManager.getDish('Airstrip');
        if (airstripData) {
            airstripData.marker = airstripPolyline;
        }
    }

    /**
     * Adds a circle marker for each dish (excluding Airstrip and Centre)
     * Markers fire the onMarkerClick callback when clicked
     * @private
     */
    _addDishMarkers() {
        Object.entries(this.dishDataManager.dishData).forEach(([key, dish]) => {
            if (dish.Label === 'Airstrip' || dish.Label === 'Centre') return;

            const marker = L.circleMarker(
                [dish.Latitude, dish.Longitude],
                {
                    radius: 8,
                    color: '#070068',
                    fillColor: '#ffffff',
                    fillOpacity: 0.8
                }
            ).bindTooltip(dish.Label, {
                permanent: false,
                direction: "right",
                offset: [10, 0],
                opacity: 0.8
            }).addTo(this.map);

            marker.on('click', () => {
                if (this.onMarkerClick) this.onMarkerClick(key);
            });

            dish.marker = marker;
        });

        // Remove airstrip marker if it was added as a circle
        const airstripMarker = this.dishDataManager.getDish('Airstrip')?.marker;
        if (airstripMarker && airstripMarker._latlng) {
            this.map.removeLayer(airstripMarker);
        }
    }

    /**
     * Updates dish marker colors based on current bookings
    * @param {Array} eventsList - All calendar events
    * @param {Array} eventTypes - Custom event types with colors
    */
    updateDishColors(eventsList, eventTypes) {
        if (!this.map) return;

        // reset all dishes to default color first
        Object.values(this.dishDataManager.dishData).forEach(dish => {
            if (!dish.marker || !dish.marker.setStyle) return;
            dish.marker.setStyle({ fillColor: '#ffffff', fillOpacity: 0.8, color: '#070068' });
        });

        // get current time
        const now = new Date().getTime();

        // group events by resource
        const bookedDishes = {};
        eventsList.forEach(ev => {
            const evStart = new DayPilot.Date(ev.start).getTime();
            const evEnd = new DayPilot.Date(ev.end).getTime();
            const resource = ev.resource;

            if (!bookedDishes[resource]) bookedDishes[resource] = [];
            bookedDishes[resource].push({
                ...ev,
                isActive: evStart <= now && evEnd >= now,
                isUpcoming: evStart > now,
            });
        });

        // apply colors
        Object.entries(bookedDishes).forEach(([dishId, events]) => {
            const dish = this.dishDataManager.getDish(dishId);
            if (!dish?.marker?.setStyle) return;

            // prefer active booking, else use first
            const activeEvent = events.find(e => e.isActive) || events[0];
            const upcomingEvent = events.find(e => e.isUpcoming);
            const targetEvent = activeEvent || upcomingEvent || events[0];
            const eventType = eventTypes.find(t => t.id === targetEvent.customEventTypeId);
            const color = eventType?.color || '#E70068';

            const el = dish.marker.getElement();
            if (el) {
                el.classList.remove('dish-active');

                if (activeEvent) {
                    // currently booked — full color, pulsing border
                    dish.marker.setStyle({
                        fillColor: color,
                        fillOpacity: 1.0,
                        color: color,
                        weight: 3,
                    });
                    el.classList.add('dish-active');
                    // dish.marker.getElement()?.classList.add('dish-active');

                } else {
                    // upcoming — lighter fill, colored border
                    dish.marker.setStyle({
                        fillColor: color,
                        fillOpacity: 0.3,
                        color: color,
                        weight: 2,
                    });
                    // dish.marker.getElement()?.classList.remove('dish-active');

                    }    }
        });
    }
    /**
     * Resets all tooltips to non-permanent hover behaviour
     */
    resetTooltips() {
        if (!this.map) return;
        this.dishDataManager.dishList.forEach(dish => {
            const marker = this.dishDataManager.getDish(dish.id)?.marker;
            if (!marker) return;
            marker.unbindTooltip();
            marker.bindTooltip(dish.id, {
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
        const centreDish = this.dishDataManager.getDish('SKA001');
        this.map.flyTo([
            centreDish.Latitude,
            centreDish.Longitude
        ], 13, { animate: true, duration: 0.5 });
    }

    /**
     * Pans to a specific dish
     * @param {string} dishId - Dish label/ID
     */
    zoomToDish(dishId) {
        if (!this.map) return;
        const dish = this.dishDataManager.getDish(dishId);
        if (!dish) return;

        this.map.flyTo(
            [dish.Latitude, dish.Longitude],
            this.map.getZoom(),
            { animate: true, duration: 0.5 }
        );
    }

    /**
     * Highlights the given dishes in pink and opens their tooltips
     * Resets all other highlighted dishes back to white
     * @param {string[]} resources - Dish IDs to highlight
     */
    highlightDishes(resources) {
        this.dishDataManager.dishList.forEach(dish => {
            const marker = this.dishDataManager.getDish(dish.id)?.marker;
            if (!marker) return;
            if (resources.some(r => r === dish.id)) {
                marker.setStyle({ fillColor: '#E70068' });
                marker.openTooltip();
            } else if (marker.options.fillColor !== '#ffffff') {
                marker.setStyle({ fillColor: '#ffffff' });
            }
        });
    }

    /**
     * Opens a dish's tooltip permanently so it persists on hover
     * @param {string[]} dishes - Dish IDs to make permanent
     */
    openTooltips(dishes) {
        if (!dishes) return;
        this.dishDataManager.dishList.forEach(dish => {
            const marker = this.dishDataManager.getDish(dish.id)?.marker;
            if (!marker) return;
            if (dishes.some(s => s === dish.id)) {
                marker.unbindTooltip();
                marker.bindTooltip(dish.id, {
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
