/**
 * Manages station data loading and caching
 */
class StationDataManager {
    constructor() {
        this.stationData = {};
        this.stationList = [];
        this.isLoaded = false;
    }

    /**
     * Loads station data from the server
     * @returns {Promise<void>}
     */
    async load() {
        if (this.isLoaded) {
            return Promise.resolve();
        }

        try {
            const response = await fetch(
                AJS.contextPath() + '/download/resources/com.skao.confluence.plugins.ska-low-confluence-calendar-macro:' +
                'ska-low-confluence-calendar-macro-resources/stationLocations.json'
            );

            if (!response.ok) {
                throw new Error("Failed to load stationLocations.json");
            }

            const stations = await response.json();
            this.parseStations(stations);
            this.isLoaded = true;
        } catch (err) {
            console.error("Station data loading error:", err);
            throw err;
        }
    }

    /**
     * Parses station data and populates internal structures
     * @private
     * @param {Array} stations - Array of station objects
     */
    parseStations(stations) {
        stations.forEach(station => {
            this.stationData[station.Label] = {
                Label: station.Label,
                Latitude: station.Latitude,
                Longitude: station.Longitude,
                Phase: station["Project Stage"]
            };
        });

        this.stationList = Object.keys(this.stationData).map(name => ({
            name,
            id: name
        }));
    }

    /**
     * Gets a station by its label/id
     * @param {string} id - Station label/id
     * @returns {Object|null} Station data or null if not found
     */
    getStation(id) {
        return this.stationData[id] || null;
    }

    /**
     * Gets all stations filtered by phase
     * @param {Array<string>} phases - Phases to filter by (e.g., ["AA1", "AA0.5"])
     * @returns {Array} Filtered stations
     */
    getStationsByPhase(phases) {
        return Object.values(this.stationData).filter(station =>
            phases.includes(station.Phase)
        );
    }

    /**
     * Gets all station labels
     * @returns {Array<string>} Station labels
     */
    getAllStationLabels() {
        return Object.keys(this.stationData);
    }
}

window.StationDataManager = StationDataManager;