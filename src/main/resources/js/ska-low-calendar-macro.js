/**
 * Main orchestrator for the SKA-Low Confluence Calendar Macro
 * Coordinates all components and manages the overall application lifecycle
 */
class SkaLowCalendarMacro {
    constructor() {
        this.stationDataManager = new StationDataManager();
        this.eventService = new EventService(this.stationDataManager);
        this.mapRenderer = new MapRenderer(this.stationDataManager);
        this.eventFormManager = new EventFormManager(this.eventService, this.stationDataManager);
        this.calendarRenderer = new CalendarRenderer(
            this.eventService,
            this.eventFormManager,
            this.stationDataManager,
            this.mapRenderer
        );
    }

    /**
     * Initializes the macro - loads data and initializes all components
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            // Load station data first (required by other components)
            await this.stationDataManager.load();

            // Initialize all macro instances on the page
            document.querySelectorAll('.ska-low-map-macro').forEach(wrapper =>
                this.mapRenderer.init(wrapper)
            );

            document.querySelectorAll('.ska-low-station-bookings-macro').forEach(wrapper =>
                this.calendarRenderer.init(wrapper)
            );
        } catch (err) {
            console.error("Macro initialization error:", err);
            throw err;
        }
    }
}
