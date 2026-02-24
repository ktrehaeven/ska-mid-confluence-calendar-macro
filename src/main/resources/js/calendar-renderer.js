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
        this.selection = { value: null, type: null };
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
        await this.eventService.loadCalendars();
        await this.eventService.getCurrentUser();
        this.calendar.events.list = await this.eventService.fetchAllEvents();
        this._initCurrentTimeLine()
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
            onEventMove: (args) => this._handleEventMove(args),
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
     * Initializes automatic updating of the "current time" vertical indicator.
     * Sets up a timer that refreshes the current-time line every minute so it
     * stays aligned with the actual time as the scheduler remains open.
     * @private
     */
    _initCurrentTimeLine() {
        setInterval(() => this._updateCurrentTimeLine(), 60000);
    }

    /**
     * Updates (or redraws) the vertical line indicating the current time
     * within the scheduler timeline.
     * If the current time is outside the visible range, no line is rendered.
     * @private
     */
    _updateCurrentTimeLine() {
        const matrix = this.calendar.nav.scroll.querySelector('.scheduler_default_matrix');
        matrix.querySelector('.current-time-line')?.remove();

        const now = new DayPilot.Date().getTime();
        const start = this.calendar.startDate.getTime();
        const end = new DayPilot.Date(this.calendar.startDate).addDays(this.calendar.days).getTime();

        if (now < start || now > end) return;

        const totalMs = end - start;
        const elapsedMs = now - start;
        const leftPx = (elapsedMs / totalMs) * matrix.scrollWidth;

        const line = document.createElement('div');
        line.className = 'current-time-line';
        line.style.cssText = `
        position: absolute;
        top: 0;
        left: ${leftPx}px;
        width: 2px;
        height: 100%;
        background: #E70068;
        pointer-events: none;
        z-index: 100;
    `;

        matrix.appendChild(line);
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
     * Updates an existing DayPilot calendar event instance
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
     * Removes an existing DayPilot calendar event instance
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
     * Adds a new DayPilot calendar event instance
     * @private
     * @param {string} confluenceId - Confluence event ID
     * @param {string} station - Station/resource identifier
     * @param {Object} eventData - Event data object
     */
    _addEventInstance(confluenceId, station, eventData) {
        const id = this.eventService.makeEventId(confluenceId, station);
        if (!this.calendar.events.find(id)) {

            const newEvent = new DayPilot.Event({
                id: this.eventService.makeEventId(confluenceId, station),
                confluenceId: confluenceId,
                text: eventData.text,
                start: eventData.start,
                end: eventData.end,
                resource: station,
                customEventTypeId: eventData.customEventTypeId,
                childSubCalendarId: (this.eventService.childSubCalendarsByEventId
                [eventData.customEventTypeId].childSubCalendarId),
                description: eventData.description,
            });

            this.calendar.events.add(newEvent);
        }
    }

    /**
     * Handles event deletion
     * Deletes the DayPilot event, all sibling events and correpsonding Confluence event
     * @private
     * @param {Object} args - Event arguments
     */
    async _handleEventDelete(args) {
        args.preventDefault();

        const name = args.e.data.text || "Untitled booking";
        const start = new DayPilot.Date(args.e.data.start).toString("dd/MM/yyyy HH:mm");
        const end = new DayPilot.Date(args.e.data.end).toString("dd/MM/yyyy HH:mm");

        // confirmation prompt
        const modal = await DayPilot.Modal.confirm(`
        <div style="text-align:left; line-height:1.6;">
            <div style="font-size:16px; font-weight:600;">
                Delete booking?
            </div>
            <br>
            <div>
                <strong>${name}</strong><br>
                ${start} - ${end}
            </div>
            <br>
            <div>
                This will remove the booking for all stations.
            </div>
            <br>
            <div>
                This action cannot be undone.
            </div>
        </div>
    `, { scrollWithPage: false });

        if (modal.canceled) {
            return;
        }

        else if (modal.result) {
            const events = this.getSiblings(args.e.data);
            events.forEach(ev => this._removeEventInstance(ev.confluenceId, ev.resource));
            this.refresh();
            await this.eventService.deleteEvent(args.e.data);
        }
    }

    /**
     * Handles event resizing
     * Resizes all sibling events and updates confluence event
     * @private
     * @param {Object} args - Event arguments
     */
    async _handleEventResize(args) {
        const events = this.getSiblings(args.e.data);
        const updatedData = {
            start: args.newStart,
            end: args.newEnd
        };
        events.forEach(ev => this._updateEventInstance(ev.confluenceId, ev.resource, updatedData));
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
     * moves all sibling events and updates confluence event
     * @private
     * @param {Object} args - Event arguments
     */
    async _handleEventMove(args) {
        const newId = this.eventService.makeEventId(args.e.data.confluenceId, args.newResource);

        // catch for moving an event to a resource where a sibling exists
        // (would result in duplicate id)
        if (args.e.data.id != newId && this.calendar.events.find(newId)) {
            args.preventDefault();
            DayPilot.Modal.alert("This booking is already assigned to that station.");
            return;
        }
        args.e.data.id = newId;
        args.e.data.resource = args.newResource

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
     * Handles time range selection
     * allows new DayPilot and confluence event creation
     * @private
     * @param {Object} args - Event arguments
     */
    async _handleTimeRangeSelected(args) {
        const result = await this.eventFormManager.show({
            start: args.start,
            customEventTypeId: this.eventService.customEventTypes.find(e => e.name === "Other").id,
            creator: this.eventService.user.displayName,
            end: args.end,
            resource: args.resource,
        }, this.calendar.events.list);

        this.calendar.clearSelection();
        if (!result) return;

        //retrieve confluence response so we can use the event id generated
        const postedEvent = await this.eventService.createEvent(result);
        if (!postedEvent?.success) return;

        // Add new DayPilot events for each selected station
        result.resource.forEach(station => {
            this._addEventInstance(postedEvent.event.id, station, result);
        });

        this.refresh();
    }

    /**
     * Handles event click
     * updates event, all siblings and corresponding confluence event
     * @private
     * @param {Object} args - Event arguments
     */
    async _handleEventClick(args) {
        let event = { ...args.e.data };
        event.resource = this.getSiblings(event).map(ev => ev.resource);
        const result = await this.eventFormManager.show(event, this.calendar.events.list);
        if (!result) return;

        await this.eventService.updateEvent(result, event);

        if (result.editAllInRecurrenceSeries) {
            // must request all confluence events again since they handle the recurrence
            // TODO: only request events from the subcalendar of updated event
            this.calendar.events.list = await this.eventService.fetchAllEvents();
            this.refresh();
            return
        }

        const currentResources = event.resource
        const nextResources = result.resource;
        const toAdd = nextResources.filter(r => !currentResources.includes(r));
        const toRemove = currentResources.filter(r => !nextResources.includes(r));
        const toKeep = nextResources.filter(r => currentResources.includes(r));

        toKeep.forEach(resource => {
            this._updateEventInstance(event.confluenceId, resource, {
                text: result.text,
                start: result.start,
                end: result.end,
                resource: resource,
                description: result.description
            });
        });

        toRemove.forEach(resource => {
            this._removeEventInstance(event.confluenceId, resource);
        });

        toAdd.forEach(resource => {
            this._addEventInstance(event.confluenceId, resource, result);
        });

        this.refresh();
    }

    /**
     * Handles row/resource click
     * zooms map and opens tooltips
     * @private
     * @param {Object} args - Event arguments
     */
    _handleRowClick(args) {
        if (args.row.id !== this.selection.value) {
            this.selectStation(args.row.id);
        } else {
            this.deselectStation();
        }
    }

    /**
     * Handles row header rendering 
     * highlights selected row
     * @private
     * @param {Object} args - Event arguments
     */
    _handleRowHeaderRender(args) {

        if (args.row.id === this.selection.value) {
            args.row.backColor = "#ccc";
        } else {
            args.row.backColor = null;
        }

    }

    /**
     * Handles time header click
     * changes colour and opens tooltips of busy stations in time range
     * @private
     * @param {Object} args - Header arguments
     */
    _handleTimeHeaderClick(args) {
        this.mapRenderer.resetTooltips();
        if (this.selection.type === 'time' &&
            args.header.start === this.selection.value.start &&
            args.header.end === this.selection.value.end) {

            this.selection = { value: null, type: null };
            this.mapRenderer.highlightStations([]);

        } else {
            this.selection.value = { start: args.header.start, end: args.header.end };
            this.selection.type = 'time';

            const resourcesInSelection = this.stationDataManager.stationList.filter(r =>
                this.calendar.events.list.some(ev =>
                    ev.resource === r.id &&
                    ev.start.getTime() < this.selection.value.end.getTime() &&
                    ev.end.getTime() > this.selection.value.start.getTime()
                )).map(r => r.id)
            this.mapRenderer.highlightStations(resourcesInSelection);
            this.mapRenderer.openTooltips(resourcesInSelection);
        }
        this.refresh();
    }

    /**
     * Handles time header rendering
     * highlights selected time header
     * @private
     * @param {Object} args - Event arguments
     */
    _handleTimeHeaderRender(args) {
        if (this.selection.type === 'time' &&
            args.header.start === this.selection.value.start &&
            args.header.end === this.selection.value.end) {
            args.header.backColor = "#ccc";
        } else {
            args.header.backColor = null;
        }
    }

    /**
     * Updates visible resources (rows) based on events in the current view
     * If a station is currently selected, it is always included even if it has no events
     */
    updateVisibleResources() {
        if (!this.calendar.visibleStart || !this.calendar.visibleEnd) return;

        const viewStart = this.calendar.visibleStart().getTime();
        const viewEnd = this.calendar.visibleEnd().getTime();

        const resourcesInView = this.stationDataManager.stationList.filter(resource =>
            resource.id === this.selection.value ||
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
        this._updateCurrentTimeLine()
    }

    /**
     * Finds siblings of a given event
     * Events can only be assigned to one resource in DayPilot
     * When a booking uses multiple stations, an event is made for each station
     * These events are siblings and are related through identical confluenceId fields
     * @param {DayPilot.Event} event - The event to find siblings for
     * @returns {Array} Array of sibling events
     */
    getSiblings(event) {
        return this.calendar.events.list.filter(
            ev => ev.confluenceId === event.confluenceId
        );
    }

    /**
     * Selects a station, updating selection state and syncing the map
     * Clears any active time selection highlight, zooms to the station and opens its tooltip
     * @param {string} stationId - Station ID to select
     */
    selectStation(stationId) {
        this.mapRenderer.resetTooltips();
        if (this.selection.type === 'time') this.mapRenderer.highlightStations([]);
        this.selection = { value: stationId, type: 'resource' };
        this.mapRenderer.zoomToStation(stationId);
        this.mapRenderer.openTooltips([stationId]);
        this.refresh();
    }

    /**
     * Deselects the current station, clearing selection state and resetting the map view
     */
    deselectStation() {
        this.mapRenderer.resetTooltips();
        this.selection = { value: null, type: null };
        this.mapRenderer.resetView();
        this.refresh();
    }
}