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
        this.navEl = null;
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
        this._initCurrentTimeLine();

        if (!calendarEl || this.isInitialized) return;
        this.isInitialized = true;

        this.calendar = this._createScheduler(calendarEl);
        this.calendar.init();

        if (navEl) {
            this.navEl = navEl;
            this.navigator = this._createNavigator(navEl);
            this.navigator.init();
            this.initRowFilter();
        }

        const xhair = new DayPilotCrosshair(this.calendar);
        xhair.attach();

        await this.eventService.loadCalendars(wrapper);
        await this.eventService.getCurrentUser();
        this.calendar.events.list = await this.eventService.fetchAllEvents();
        this._startAutoRefresh();
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
            eventBorderRadius: 6,
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
    async _updateCurrentTimeLine() {

        const now = await getNetworkTime();
        const start = this.calendar.startDate.getTime();
        const end = new DayPilot.Date(this.calendar.startDate).addDays(this.calendar.days).getTime();

        const matrix = this.calendar.nav.scroll.querySelector('.scheduler_default_matrix');
        matrix.querySelector('.current-time-line')?.remove();

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

        async function getNetworkTime() {
            try {
                const response = await fetch('https://time.now/developer/api/timezone/Australia/Perth');
                const data = await response.json()
                return new DayPilot.Date(data.unixtime * 1000).addHours(8).getTime(); // convert to milliseconds and adjust for AWST
            } catch (error) {
                console.error("Failed to fetch time:", error);
            }
        }
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
                description: eventData.description,
            });

            this.calendar.events.add(newEvent);
        }
    }

    /**
     * Handles event deletion
     * Deletes the DayPilot event, all sibling events and corresponding Confluence event
     * @private
     * @param {Object} args - Event arguments
     */
    async _handleEventDelete(args) {

        args.preventDefault();
        const result = await this.eventFormManager.confirmDelete(args.e.data)
        if (!result) return

        if (result.deleteScope == "single") {
            // handle single delete without confluence request for faster response
            const events = this.getSiblings(args.e.data);
            events.forEach(ev => this._removeEventInstance(ev.confluenceId, ev.resource));
            await this.eventService.deleteEvent(args.e.data, result.deleteScope);
        }
        else {
            // request events from the subcalendar of updated event to update recurrence
            await this.eventService.deleteEvent(args.e.data, result.deleteScope);
            const eventId = args.e.data.customEventTypeId
            if (eventId) {
                const updatedEvents = await this.eventService.fetchEventsByEventId(eventId);
                this.calendar.events.list = [
                    ...this.calendar.events.list.filter(e => e.customEventTypeId !== eventId),
                    ...updatedEvents
                ];
            }
            else { this.calendar.events.list = await this.eventService.fetchAllEvents(); }
        }
        this.refresh();
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

        const eventId = result.customEventTypeId
        const updatedEvents = await this.eventService.fetchEventsByEventId(eventId);
        this.calendar.events.list = [
            ...this.calendar.events.list.filter(e => e.customEventTypeId !== eventId),
            ...updatedEvents
        ];
        this.refresh();

        // // Add new DayPilot events for each selected station
        // result.resource.forEach(station => {
        //     this._addEventInstance(postedEvent.event.id, station, result);
        // });

        // this.refresh();
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

        this.calendar.events.list = await this.eventService.fetchAllEvents();
        this.refresh();
        return

        // The below code was an attempt to update events without refetching all events 
        // from Confluence, but due to the complexity of handling recurring events and 
        // event types it is less error-prone to simply refetch all events after an update.

        // const currentResources = event.resource
        // const nextResources = result.resource;
        // const toAdd = nextResources.filter(r => !currentResources.includes(r));
        // const toRemove = currentResources.filter(r => !nextResources.includes(r));
        // const toKeep = nextResources.filter(r => currentResources.includes(r));

        // toKeep.forEach(resource => {
        //     this._updateEventInstance(event.confluenceId, resource, {
        //         text: result.text,
        //         customEventTypeId: result.customEventTypeId || "",
        //         start: result.start,
        //         end: result.end,
        //         resource: resource,
        //         description: result.description
        //     });
        // });

        // toRemove.forEach(resource => {
        //     this._removeEventInstance(event.confluenceId, resource);
        // });

        // toAdd.forEach(resource => {
        //     this._addEventInstance(event.confluenceId, resource, result);
        // });

        // this.refresh();
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
     * and the input in filter box
     */
    updateVisibleResources() {
        if (!this.calendar.visibleStart || !this.calendar.visibleEnd) return;

        const viewStart = this.calendar.visibleStart().getTime();
        const viewEnd = this.calendar.visibleEnd().getTime();
        const filterQuery = this._rowFilterInput?.value.trim().toUpperCase() || '';

        this.calendar.resources = this.stationDataManager.stationList.filter(resource => {
            const hasEvents = this.calendar.events.list.some(event =>
                event.resource === resource.id &&
                event.start.getTime() < viewEnd &&
                event.end.getTime() > viewStart
            );
            const matchesFilter = !filterQuery ||
                resource.name?.toUpperCase().includes(filterQuery) ||
                resource.id?.toUpperCase().includes(filterQuery);

            return filterQuery ? matchesFilter : hasEvents;
        });
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

    /**
     * Fetches all events every 5 minutes
     */
    _startAutoRefresh(intervalMs = 300000) {
        this._refreshInterval = setInterval(() => {
            this.eventService.fetchAllEvents()
            this.refresh()
        },
            intervalMs);

        document.addEventListener('visibilitychange', this._onVisibilityChange.bind(this));
    }

    /**
     * Fetches all events when you tab back into the page
     */
    _onVisibilityChange() {
        if (document.visibilityState === 'visible') {
            this.eventService.fetchAllEvents();
            this.refresh()
        }
    }

    /**
     * Initialises the row filter input below the navigator panel.
     * Filters visible scheduler resources by name or ID on each keystroke.
     */
    initRowFilter() {
        const navEl = this.navEl;
        if (!navEl) return;

        const filterContainer = document.createElement('div');
        filterContainer.className = 'row-filter-container';

        const row = document.createElement('div');
        row.className = 'row-filter-row';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Filter stations...';
        input.className = 'row-filter-input';

        const clearBtn = document.createElement('button');
        clearBtn.textContent = '✕';
        clearBtn.className = 'row-filter-clear';

        row.appendChild(input);
        row.appendChild(clearBtn);
        filterContainer.appendChild(row);

        filterContainer.addEventListener('mousedown', (e) => e.stopPropagation());
        filterContainer.addEventListener('click', (e) => e.stopPropagation());

        navEl.parentNode.appendChild(filterContainer);

        const applyFilter = (query) => {
            const q = query.trim().toLowerCase();
            clearBtn.style.display = q ? 'block' : 'none';
            this.refresh();
        };

        input.addEventListener('input', (e) => applyFilter(e.target.value));

        clearBtn.addEventListener('click', () => {
            input.value = '';
            applyFilter('');
            input.focus();
        });

        this._rowFilterInput = input;
    }
}

class DayPilotCrosshair {

    constructor(dp) {
        this.dp = dp;
        this._lastRowEl = null;   // currently highlighted row header element
        this._lastColEls = [];     // currently highlighted col header elements
        this._onMove = this._onMove.bind(this);
        this._onLeave = this._onLeave.bind(this);
        this._attached = false;
    }

    attach() {
        if (this._attached) return;

        // The scroll container is the mouse target
        this._scrollEl = this.dp.nav.scrollable || this.dp.nav.scroll;
        if (!this._scrollEl) { console.warn('DayPilotCrosshair: not ready'); return; }

        this._scrollEl.addEventListener('mousemove', this._onMove);
        this._scrollEl.addEventListener('mouseleave', this._onLeave);
        this._attached = true;
    }

    _onMove(e) {
        const rect = this._scrollEl.getBoundingClientRect();

        // Mouse coords relative to the scrollable area (accounting for scroll)
        const xRel = e.clientX - rect.left + this._scrollEl.scrollLeft;
        const yRel = e.clientY - rect.top + this._scrollEl.scrollTop;

        this._highlightRow(yRel);
        this._highlightCol(xRel);
    }

    _onLeave() {
        this._clearHighlights();
    }

    _highlightRow(yRel) {
        const dp = this.dp;
        const rowlist = dp.rowlist;
        const divHeader = dp.divHeader;
        if (!rowlist || !divHeader) return;

        let cumY = 0, rowIdx = -1;
        for (let i = 0; i < rowlist.length; i++) {
            cumY += rowlist[i].height;
            if (yRel < cumY) { rowIdx = i; break; }
        }
        if (rowIdx === -1) return;

        // .cellDiv is the inner _rowheader div — the wrapper has no class/background
        const rowEl = divHeader.rows[rowIdx]?.cellDiv;
        if (!rowEl || rowEl === this._lastRowEl) return;

        this._clearRow();
        rowEl.classList.add('dp-xh-row');
        this._lastRowEl = rowEl;
    }

    _highlightCol(xRel) {
        const dp = this.dp;

        // Column index from pixel x offset in the scrollable area
        const colIdx = Math.floor(xRel / dp.cellWidth / 4);

        if (colIdx === this._lastColIdx) return;
        this._clearCol();
        this._lastColIdx = colIdx;

        // Highlight every timeHeader row for this column
        // Keys are "colIndex_timeHeaderRowIndex" (one per timeHeaders[] level)
        const numHeaderRows = dp.timeHeaders ? dp.timeHeaders.length : 2;
        const yb = dp.yb;
        if (!yb || !yb.timeHeader) return;

        const highlighted = [];
        for (let row = 0; row < numHeaderRows; row++) {
            const key = colIdx + '_' + row;
            const el = yb.timeHeader[key];
            if (el) {
                el.classList.add('dp-xh-col');
                highlighted.push(el);
            }
        }
        this._lastColEls = highlighted;
    }

    _clearRow() {
        if (this._lastRowEl) {
            this._lastRowEl.classList.remove('dp-xh-row');
            this._lastRowEl = null;
        }
    }

    _clearCol() {
        this._lastColEls.forEach(el => el.classList.remove('dp-xh-col'));
        this._lastColEls = [];
        this._lastColIdx = -1;
    }

    _clearHighlights() {
        this._clearRow();
        this._clearCol();
    }
}

window.CalendarRenderer = CalendarRenderer;