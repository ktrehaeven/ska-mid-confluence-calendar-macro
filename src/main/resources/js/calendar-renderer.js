/**
 * Manages the calendar scheduler and event interactions
 */
class CalendarRenderer {
    constructor(eventService, eventFormManager, stationDataManager, mapRenderer) {
        this.eventService = eventService;
        this.eventFormManager = eventFormManager;
        this.stationDataManager = stationDataManager;
        this.mapRenderer = mapRenderer;
        this.calendar = null;
        this.navigator = null;
        this.selectedResourceId = null;
        this.selectedTime = { start: null, end: null };
        this.isInitialized = false;
    }

    /**
     * Initializes the calendar in the given wrapper element
     * @param {HTMLElement} wrapper - Container element for the calendar
     * @returns {Promise<void>}
     */
    async init(wrapper) {
        const calendarEl = wrapper.querySelector('.daypilot');
        const navEl = wrapper.querySelector('.daypilot-nav');

        if (!calendarEl || this.isInitialized) return;
        this.isInitialized = true;

        this.calendar = this._createScheduler(calendarEl);
        this.calendar.init();

        if (navEl) {
            this.navigator = this._createNavigator(navEl);
            this.navigator.init();
        }

        // Load events
        const events = await this.eventService.fetchAllEvents();
        this.calendar.events.list = events;
        this.refresh();
    }

    /**
     * Creates the DayPilot Scheduler instance
     * @private
     * @param {HTMLElement} calendarEl - Calendar container element
     * @returns {DayPilot.Scheduler} Configured scheduler instance
     */
    _createScheduler(calendarEl) {
        return new DayPilot.Scheduler(calendarEl, {
            timeHeaders: [
                { groupBy: "Day" },
                { groupBy: "Hour" }
            ],
            scale: "CellDuration",
            locale: "en-AU",
            cellDuration: 15,
            cellWidth: 20,
            days: 1,
            width: "100%",
            businessBeginsHour: 9,
            businessEndsHour: 17,
            dynamicEventRendering: "Disabled",
            useEventBoxes: "Never",
            startDate: DayPilot.Date.today(),
            timeRangeSelectedHandling: "Enabled",
            onTimeRangeSelected: (args) => this._handleTimeRangeSelected(args),
            onEventClick: (args) => this._handleEventClick(args),
            eventMoveHandling: "Update",
            onEventMoved: (args) => this._handleEventMove(args),
            eventResizeHandling: "Update",
            onEventResized: (args) => this._handleEventResize(args),
            eventDeleteHandling: "Update",
            onEventDelete: (args) => this._handleEventDelete(args),
            onRowClick: (args) => this._handleRowClick(args),
            onBeforeRowHeaderRender: (args) => this._handleRowHeaderRender(args),
            timeHeaderClickHandling: "Update",
            onTimeHeaderClick: (args) => this._handleTimeHeaderClick(args),
            onBeforeTimeHeaderRender: (args) => this._handleTimeHeaderRender(args),
        });
    }

    /**
     * Creates the DayPilot Navigator instance
     * @private
     * @param {HTMLElement} navEl - Navigator container element
     * @returns {DayPilot.Navigator} Configured navigator instance
     */
    _createNavigator(navEl) {
        return new DayPilot.Navigator(navEl, {
            selectMode: "Day",
            showMonths: 2,
            skipMonths: 1,
            freeHandSelectionEnabled: true,
            onTimeRangeSelected: (args) => {
                this.calendar.startDate = args.start;
                this.calendar.days = args.days;
                this.refresh();
            }
        });
    }

    /**
     * Creates a DayPilot event object with standard configuration
     * @private
     * @param {string} confluenceId - Confluence event ID
     * @param {string} station - Station/resource identifier
     * @param {Object} eventData - Event data object
     * @returns {DayPilot.Event} Configured event instance
     */
    _createDayPilotEvent(confluenceId, station, eventData) {
        return new DayPilot.Event({
            id: this.eventService.makeEventId(confluenceId, station),
            confluenceId: confluenceId,
            text: eventData.text,
            start: eventData.start,
            end: eventData.end,
            resource: station,
            customEventTypeId: eventData.customEventTypeId,
            description: eventData.description,
        });
    }

    /**
     * Updates an existing calendar event instance
     * @private
     * @param {string} confluenceId - Confluence event ID
     * @param {string} resource - Resource/station ID
     * @param {Object} updatedData - Updated event properties
     * @returns {Object|null} Updated event or null if not found
     */
    _updateEventInstance(confluenceId, resource, updatedData) {
        const id = this.eventService.makeEventId(confluenceId, resource);
        const ev = this.calendar.events.find(id);
        if (ev) {
            Object.assign(ev.data, updatedData);
        }
        return ev;
    }

    /**
     * Removes a calendar event instance
     * @private
     * @param {string} confluenceId - Confluence event ID
     * @param {string} resource - Resource/station ID
     */
    _removeEventInstance(confluenceId, resource) {
        const id = this.eventService.makeEventId(confluenceId, resource);
        const ev = this.calendar.events.find(id);
        if (ev) {
            this.calendar.events.remove(ev);
        }
    }

    /**
     * Adds a new calendar event instance
     * @private
     * @param {string} confluenceId - Confluence event ID
     * @param {string} station - Station/resource identifier
     * @param {Object} eventData - Event data object
     */
    _addEventInstance(confluenceId, station, eventData) {
        const id = this.eventService.makeEventId(confluenceId, station);
        if (!this.calendar.events.find(id)) {
            const newEvent = this._createDayPilotEvent(confluenceId, station, eventData);
            this.calendar.events.add(newEvent);
        }
    }

    /**
     * Handles event deletion
     * @private
     * @param {Object} args - Event arguments
     */
    async _handleEventDelete(args) {

        if (!confirm("Do you really want to delete this booking?\n\n"
            + "This will remove all associated bookings in the same time slot.\n\n"
            + "This action cannot be undone.")) {
            args.preventDefault();
            return;
        }

        const events = this.getSiblings(args.e.data);
        events.forEach(ev => {
            this._removeEventInstance(ev.confluenceId, ev.resource);
        });
        this.refresh();
        await this.eventService.deleteEvent(args.e.data);
    }

    /**
     * Handles event resizing
     * @private
     * @param {Object} args - Event arguments
     */
    async _handleEventResize(args) {
        const events = this.getSiblings(args.e.data);
        const updatedData = {
            start: args.newStart,
            end: args.newEnd
        };
        events.forEach(ev => {
            this._updateEventInstance(ev.confluenceId, ev.resource, updatedData);
        });
        this.refresh();
        // Prepare form data with all sibling resources for the Confluence API
        const formData = {
            ...args.e.data,
            start: args.newStart,
            end: args.newEnd,
            resource: events.map(ev => String(ev.resource)).filter(Boolean)
        };
        await this.eventService.updateEvent(formData, args.e.data);
    }

    /**
     * Handles event moving
     * @private
     * @param {Object} args - Event arguments
     */
    async _handleEventMove(args) {
        args.e.data.id = this.eventService.makeEventId(args.e.data.confluenceId, args.newResource);
        const events = this.getSiblings(args.e.data);
        const updatedData = {
            start: args.newStart,
            end: args.newEnd
        };
        events.forEach(ev => {
            this._updateEventInstance(ev.confluenceId, ev.resource, updatedData);
        });
        this.refresh();
        // Prepare form data with all sibling resources for the Confluence API
        const formData = {
            ...args.e.data,
            start: args.newStart,
            end: args.newEnd,
            resource: events.map(ev => String(ev.resource)).filter(Boolean)
        };
        await this.eventService.updateEvent(formData, args.e.data);
    }

    /**
     * Handles time range selection (new event creation)
     * @private
     * @param {Object} args - Event arguments
     */
    async _handleTimeRangeSelected(args) {
        const result = await this.eventFormManager.show({
            text: "",
            start: args.start,
            end: args.end,
            resource: args.resource,
            description: ""
        });

        this.calendar.clearSelection();
        if (!result) return;
        const postedEvent = await this.eventService.createEvent(result);
        if (!postedEvent?.success) return;

        // Add new DayPilot events for each selected station
        const stations = this.eventService.normalizeResources(result.resource);
        await stations.forEach(station => {
            this._addEventInstance(postedEvent.event.id, station, result);
        });

        this.refresh();
    }

    /**
     * Handles event click (event editing)
     * @private
     * @param {Object} args - Event arguments
     */
    async _handleEventClick(args) {
        const event = args.e.data;
        const siblings = this.getSiblings(event)
        const currentResources = [...new Set(
            siblings.map(ev => String(ev.resource)).filter(Boolean)
        )];

        const result = await this.eventFormManager.show({
            text: event.text,
            customEventTypeId: event.customEventTypeId,
            start: event.start,
            end: event.end,
            resource: currentResources || [],
            description: event.description || ""
        });

        if (!result) return;

        const nextResources = this.eventService.normalizeResources(result.resource);
        const toAdd = nextResources.filter(r => !currentResources.includes(r));
        const toRemove = currentResources.filter(r => !nextResources.includes(r));
        const toKeep = nextResources.filter(r => currentResources.includes(r));

        await this.eventService.updateEvent(result, event);

        // Update kept instances
        toKeep.forEach(resource => {
            this._updateEventInstance(event.confluenceId, resource, {
                text: result.text,
                start: result.start,
                end: result.end,
                resource: resource,
                description: result.description
            });
        });

        // Remove instances
        toRemove.forEach(resource => {
            this._removeEventInstance(event.confluenceId, resource);
        });

        // Add new instances
        toAdd.forEach(resource => {
            this._addEventInstance(event.confluenceId, resource, result);
        });

        this.refresh();
    }

    /**
     * Handles row/resource click
     * @private
     * @param {Object} args - Event arguments
     */
    _handleRowClick(args) {
        if (args.row.id !== this.selectedResourceId) {
            // Zoom to station
            if (this.mapRenderer) {
                this.mapRenderer.zoomToStation(args.row.id);
            }
            this.selectedResourceId = args.row.id;
        } else {
            // Reset view
            if (this.mapRenderer) {
                this.mapRenderer.resetView();
                this.mapRenderer.resetTooltips();
            }
            this.selectedResourceId = null;
        }
        this.refresh();
    }

    /**
     * Handles row header rendering (highlight selected row)
     * @private
     * @param {Object} args - Event arguments
     */
    _handleRowHeaderRender(args) {
        if (args.row.id === this.selectedResourceId) {
            args.row.backColor = "#e0e0e0";
        } else {
            args.row.backColor = null;
        }
    }

    /**
     * Handles time header click
     * @private
     * @param {Object} args - Header arguments
     */
    _handleTimeHeaderClick(args) {
        if (args.header.start === this.selectedTime.start &&
            args.header.end === this.selectedTime.end) {

            this.selectedTime = { start: null, end: null };

        } else {
            console.log(this.calendar.events.list.filter(
                ev => ev.start.getTime() < args.header.end.getTime() &&
                    ev.end.getTime() > args.header.start.getTime()
            ))
            this.selectedTime = { start: args.header.start, end: args.header.end };
        }
        this.refresh();
        console.log("click!", args)
    }

    /**
     * Handles time header rendering (highlight selected time header)
     * @private
     * @param {Object} args - Event arguments
     */
    _handleTimeHeaderRender(args) {
        if (args.header.start === this.selectedTime.start &&
            args.header.end === this.selectedTime.end) {
            args.header.backColor = "#e0e0e0";
        } else {
            args.header.backColor = null;
        }
    }

    /**
     * Updates visible resources based on events in the current view
     */
    updateVisibleResources() {
        if (!this.calendar.visibleStart || !this.calendar.visibleEnd) return;

        const viewStart = this.calendar.visibleStart().getTime();
        const viewEnd = this.calendar.visibleEnd().getTime();

        const resourcesInView = this.stationDataManager.stationList.filter(resource =>
            this.calendar.events.list.some(event =>
                event.resource === resource.id &&
                event.start.getTime() < viewEnd &&
                event.end.getTime() > viewStart
            )
        );

        this.calendar.resources = resourcesInView;
    }

    /**
     * Refreshes the calendar view
     */
    refresh() {
        this.updateVisibleResources();
        this.calendar.update();
    }

    /**
     * Gets siblings of a given event (events with the same Confluence ID)
     * @param {DayPilot.Event} event - The event to find siblings for
     * @returns {Array} Array of sibling events
     */
    getSiblings(event) {
        return this.calendar.events.list.filter(
            ev => ev.confluenceId === event.confluenceId
        );
    }
}