/**
 * Main orchestrator for the SKA-Mid Confluence Calendar Macro
 * Coordinates all components and manages the overall application lifecycle
 */
class SkaMidCalendarMacro {
    constructor() {
        this.dishDataManager = new window.DishDataManager();
        this.eventService = new window.EventService(this.dishDataManager);
        this.eventFormManager = new window.EventFormManager(this.eventService, this.dishDataManager);
        this.mapRenderer = new window.MapRenderer(this.dishDataManager, (dishId) => {
            this.calendarRenderer.selectDish(dishId);
        });
        this.calendarRenderer = new window.CalendarRenderer(
            this.eventService,
            this.eventFormManager,
            this.dishDataManager,
            this.mapRenderer
        );
    }

    /**
     * Initializes the macro - loads data and initializes all components
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            await this.dishDataManager.load();
            document.querySelectorAll('.ska-mid-map-macro').forEach(wrapper =>
                this.mapRenderer.init(wrapper)
            );
            document.querySelectorAll('.ska-mid-dish-bookings-macro').forEach(wrapper =>
                this.calendarRenderer.init(wrapper)
            );
        } catch (err) {
            console.error("Macro initialization error:", err);
            throw err;
        }
    }
}

window.SkaMidCalendarMacro = SkaMidCalendarMacro;