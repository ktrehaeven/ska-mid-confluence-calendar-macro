/**
 * Main orchestrator for the SKA-Low Confluence Calendar Macro
 * Coordinates all components and manages the overall application lifecycle
 */
class SkaLowCalendarMacro {
    constructor() {
        this.stationDataManager = new window.StationDataManager();
        this.eventService = new window.EventService(this.stationDataManager);
        this.eventFormManager = new window.EventFormManager(this.eventService, this.stationDataManager);
        this.mapRenderer = new window.MapRenderer(this.stationDataManager, (stationId) => {
            this.calendarRenderer.selectStation(stationId);
        });
        this.calendarRenderer = new window.CalendarRenderer(
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
            await this.stationDataManager.load();
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

window.SkaLowCalendarMacro = SkaLowCalendarMacro;