/**
 * Manages the calendar scheduler and event interactions
 */
class CalendarRenderer {
    constructor(eventService, eventFormManager, dishDataManager, mapRenderer) {
        this.eventService = eventService;
        this.eventFormManager = eventFormManager;
        this.dishDataManager = dishDataManager;
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
            this.initNavFooter();
        }

        const xhair = new DayPilotCrosshair(this.calendar);
        xhair.attach();

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

        const now = new DayPilot.Date(new Date().toLocaleString("sv-SE", { timeZone: "Africa/Johannesburg" })).getTime();
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
     * @param {Array} eventId - event ID
     * @param {Object} updatedData - Updated event properties
     * @returns {Object|null} Updated event or null if not found
     */
    _updateEventInstance(eventId, updatedData) {
        const ev = this.calendar.events.find(eventId);

        if (ev) {
            Object.assign(ev.data, updatedData);
        }

        return ev;
    }

    /**
     * Removes an existing DayPilot calendar event instance
     * @private
     * @param {Array} eventId - event ID
     */
    _removeEventInstance(eventId) {
        const ev = this.calendar.events.find(eventId);

        if (ev) {
            this.calendar.events.remove(ev);
        }
    }

    /**
     * Adds a new DayPilot calendar event instance
     * @private
     * @param {string} seriesUuid - event series uuid
     * @param {Object} eventData - Event data object
     * @param {Object} dish - dish
     */
    _addEventInstance(eventData, seriesUuid, dish) {

    const eventId = this.eventService.makeEventId(seriesUuid, dish);

    if (!this.calendar.events.find(eventId)) {

        const newEvent = new DayPilot.Event({
            id: eventId,
            text: eventData.text,
            start: eventData.start,
            end: eventData.end,
            resource: dish,
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
        const result = await this.eventFormManager.confirmDelete(args.e.data);
        if (!result) return;

        if (result.deleteScope === "single") {
            // only remove the clicked event, not siblings
            this._removeEventInstance(args.e.data.id);
        } else {
            // remove all siblings
            const siblings = this.getSiblings(args.e.data);
            siblings.forEach(ev => this._removeEventInstance(ev.id));
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
        const user = await this.eventService.getCurrentUser();
        const events = this.getSiblings(args.e.data);
        const updatedData = {
            start: args.newStart,
            end: args.newEnd,
            creator: user.displayName,
        };
        events.forEach(ev => {
            this._updateEventInstance(ev.id, updatedData);
        });
        this.refresh();
        // Prepare form data with all sibling resources for the Confluence API
        //const formData = {
        //    ...args.e.data,
        //    start: args.newStart,
        //    end: args.newEnd,
        //    resource: events.map(ev => String(ev.resource)).filter(Boolean)
        //};
        //await this.eventService.updateEvent(formData, args.e.data);
    }

    async _promptScope(siblings) {
        if (siblings.length <= 1) return "all";
        const scope = await DayPilot.Modal.confirm(
            "Apply to this dish only, or all dishes in this booking?",
            { okText: "All dishes", cancelText: "This dish only" }
        );
        return scope.result ? "all" : "single";
    }

    async _handleEventMove(args) {
        const newId = this.eventService.makeEventId(
            this.eventService.getUUIDFromEventId(args.e.data.id),
            args.newResource
        );
        const event = args.e.data;
        const siblings = this.getSiblings(event);

        // prevent duplicate sibling resource assignment
        const duplicate = this.calendar.events.list.find(ev =>
            ev.id === newId && ev.id !== args.e.data.id
        );
        if (duplicate) {
            args.preventDefault();
            DayPilot.Modal.alert("This booking is already assigned to that dish.");
            return;
        }

        const user = await this.eventService.getCurrentUser();
        const scope = await this._promptScope(siblings);
        const targets = scope === "all" ? siblings : [event];

        targets.forEach(ev => {
            this._updateEventInstance(ev.id, {
                start: args.newStart,
                end: args.newEnd,
                creator: user.displayName,
                // only update resource and id for the actually dragged event
                ...(ev.id === args.e.data.id && {
                    resource: args.newResource,
                    id: newId,
                }),
            });
        });

        this.refresh();
    }

    async _handleEventClick(args) {
        const user = await this.eventService.getCurrentUser();
        let event = { ...args.e.data };
        const siblings = this.getSiblings(event);

        const result = await this.eventFormManager.show(event, this.calendar.events.list);
        if (!result) return;

        const scope = await this._promptScope(siblings);
        const targets = scope === "all" ? siblings : [event];

        const uuid = this.eventService.getUUIDFromEventId(event.id);
        targets.forEach(ev => {
            this._removeEventInstance(ev.id);
            this._addEventInstance(result, uuid, ev.resource);
        });

        this.refresh();
    }

    /**
     * Handles time range selection
     * allows new DayPilot and confluence event creation
     * @private
     * @param {Object} args - Event arguments
     */
    async _handleTimeRangeSelected(args) {
        const user = await this.eventService.getCurrentUser();
        const result = await this.eventFormManager.show({
            start: args.start,
            customEventTypeId: this.eventService.customEventTypes.find(e => e.name === "Other").id,
            creator: user.displayName,
            end: args.end,
            resource: args.resource,
        }, this.calendar.events.list);

        this.calendar.clearSelection();
        if (!result) return;


        const seriesUuid = this.eventService.createSeriesUUID();
        console.log('result.rruleStr before expand:', result.rruleStr);
        // generate occurrences from rrule if recurring
        const instances = this._expandEvent(result, seriesUuid);
        console.log('instances after expand:', instances.length);
        
        instances.forEach(instance => {
            result.resource.forEach(dish => {
                this._addEventInstance(instance, seriesUuid, dish);
            });
        });

        this.refresh();
    }

    _expandEvent(result, uuid) {
        console.log('_expandEvent called', result);
        if (!result.rruleStr) {
            console.log('_expandEvent: no rruleStr, returning as-is');
            return [result]; // not recurring, just return as-is
        }

        const parsed = this.eventFormManager._parseRrule(result.rruleStr);
        console.log('parsed rrule:', parsed);  // ← add this
        // new DayPilot.Date(this.eventFormManager._rruleDateToInput(parsed.UNTIL));
        if (!parsed.FREQ) {
            console.log('_expandEvent: no FREQ after parsing, returning as-is');
            return [result];
        }

        const freq = parsed.FREQ;
        const interval = parseInt(parsed.INTERVAL) || 1;
        const byday = parsed.BYDAY ? parsed.BYDAY.split(',') : [];
        const count = parsed.COUNT ? parseInt(parsed.COUNT) : null;
        console.log('parsed.UNTIL:', parsed.UNTIL);
        const until = (parsed.UNTIL && typeof parsed.UNTIL === 'string')
            ? new DayPilot.Date(this.eventFormManager._rruleDateToInput(parsed.UNTIL))
            : null;

        const DAY_MAP = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0 };

        // guard against invalid start
        const startDate = result.start instanceof DayPilot.Date 
        ? result.start 
        : new DayPilot.Date(result.start);
        if (!startDate || !startDate.getTime()) {
            console.warn('_expandEvent: invalid start date', result.start);
            return [result];
        }
        const endDate = result.end instanceof DayPilot.Date 
        ? result.end 
        : new DayPilot.Date(result.end);
        const duration = endDate.getTime() - startDate.getTime();

        // cap expansion to 1 year ahead to avoid infinite loops
        const hardLimit = startDate.addDays(365);
        const rangeEnd = until
            ? (until.getTime() < hardLimit.getTime() ? until : hardLimit)
            : hardLimit;

        const instances = [];
        let current = startDate;
        let countSoFar = 0;

        while (current.getTime() <= rangeEnd.getTime()) {
            if (count && countSoFar >= count) break;

            const jsDate = current.toDate();
            const dayOfWeek = jsDate.getDay();

            let matches = false;
            if (freq === 'DAILY') {
                matches = true;
            }
            if (freq === 'WEEKLY') {
                matches = byday.length === 0 || byday.some(d => DAY_MAP[d] === dayOfWeek);
            }
            if (freq === 'MONTHLY') {
                matches = jsDate.getDate() === startDate.toDate().getDate();
            }
            if (freq === 'YEARLY') {
                const orig = startDate.toDate();
                matches = jsDate.getDate() === orig.getDate() &&
                        jsDate.getMonth() === orig.getMonth();
            }

            if (matches) {
                instances.push({
                    ...result,
                    start: current,
                    end: new DayPilot.Date(current.getTime() + duration),
                });
                countSoFar++;
            }

            // advance by interval only when we hit a freq boundary
            if (freq === 'DAILY' && matches) {
                current = current.addDays(interval);
            } else if (freq === 'WEEKLY') {
                // advance day by day, jump by interval weeks after completing a week
                current = current.addDays(1);
                if (current.toDate().getDay() === startDate.toDate().getDay() && instances.length > 0) {
                    current = current.addDays((interval - 1) * 7);
                }
            } else if (freq === 'MONTHLY' && matches) {
                current = current.addDays(1); // let it find next matching date
                // jump ahead by interval months minus remaining days
                const nextMonth = new DayPilot.Date(
                    new Date(jsDate.getFullYear(), jsDate.getMonth() + interval, jsDate.getDate())
                );
                current = nextMonth;
            } else if (freq === 'YEARLY' && matches) {
                current = new DayPilot.Date(
                    new Date(jsDate.getFullYear() + interval, jsDate.getMonth(), jsDate.getDate())
                );
            } else {
                current = current.addDays(1);
            }
        console.log('freq:', freq);
        console.log('byday:', byday);
        console.log('startDate:', startDate.toString());
        console.log('startDate dayOfWeek:', startDate.toDate().getDay());
        console.log('DAY_MAP MO:', DAY_MAP['MO']);
        }

        return instances;
    }
    /**
     * Handles event click
     * updates event, all siblings and corresponding confluence event
     * @private
     * @param {Object} args - Event arguments
     */

    /**
     * Handles row/resource click
     * zooms map and opens tooltips
     * @private
     * @param {Object} args - Event arguments
     */
    _handleRowClick(args) {
        if (args.row.id !== this.selection.value) {
            this.selectDish(args.row.id);
        } else {
            this.deselectDish();
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
     * changes colour and opens tooltips of busy dishes in time range
     * @private
     * @param {Object} args - Header arguments
     */
    _handleTimeHeaderClick(args) {
        this.mapRenderer.resetTooltips();
        if (this.selection.type === 'time' &&
            args.header.start === this.selection.value.start &&
            args.header.end === this.selection.value.end) {

            this.selection = { value: null, type: null };
            this.mapRenderer.highlightDishes([]);

        } else {
            this.selection.value = { start: args.header.start, end: args.header.end };
            this.selection.type = 'time';

            const resourcesInSelection = this.dishDataManager.dishList.filter(r =>
                this.calendar.events.list.some(ev =>
                    ev.resource === r.id &&
                    ev.start.getTime() < this.selection.value.end.getTime() &&
                    ev.end.getTime() > this.selection.value.start.getTime()
                )).map(r => r.id)
            this.mapRenderer.highlightDishes(resourcesInSelection);
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

        this.calendar.resources = this.dishDataManager.dishList.filter(resource => {
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
     * When a booking uses multiple dishes, an event is made for each dish
     * These events are siblings and are related through identical uuid fields
     * @param {DayPilot.Event} event - The event to find siblings for
     * @returns {Array} Array of sibling events
     */
    getSiblings(event) {
        return this.calendar.events.list.filter(
            ev => this.eventService.getUUIDFromEventId(ev.id) === this.eventService.getUUIDFromEventId(event.id)
        );
    }

    /**
     * Selects a dish, updating selection state and syncing the map
     * Clears any active time selection highlight, zooms to the dish and opens its tooltip
     * @param {string} dishId - Dish ID to select
     */
    selectDish(dishId) {
        this.mapRenderer.resetTooltips();
        if (this.selection.type === 'time') this.mapRenderer.highlightDishes([]);
        this.selection = { value: dishId, type: 'resource' };
        this.mapRenderer.zoomToDish(dishId);
        this.mapRenderer.openTooltips([dishId]);
        this.refresh();
    }

    /**
     * Deselects the current dish, clearing selection state and resetting the map view
     */
    deselectDish() {
        this.mapRenderer.resetTooltips();
        this.selection = { value: null, type: null };
        this.mapRenderer.resetView();
        this.refresh();
    }

    /**
     * Fetches all events every 5 minutes
     */
    _startAutoRefresh(intervalMs = 300000) {
        this._refreshInterval = setInterval(async () => {
            //this.calendar.events.list = await this.eventService.fetchAllEvents();
            this.refresh()
        },
            intervalMs);

        document.addEventListener('visibilitychange', this._onVisibilityChange.bind(this));
    }

    /**
     * Fetches all events when you tab back into the page
     */
    async _onVisibilityChange() {
        if (document.visibilityState === 'visible') {
            //this.calendar.events.list = await this.eventService.fetchAllEvents();
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
        input.placeholder = 'Filter dishes...';
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

    initNavFooter() {
        const navEl = this.navEl;
        if (!navEl) return;

        const footer = document.createElement('div');
        footer.className = 'nav-footer';

        const logo = document.createElement('img');
        logo.src = AJS.contextPath() +
            '/download/resources/com.skao.confluence.plugins.ska-mid-confluence-calendar-macro:' +
            'ska-mid-confluence-calendar-macro-resources/images/skaoLogo.png';
        logo.className = 'nav-footer-logo';

        const text = document.createElement('span');
        text.className = 'nav-footer-text';
        text.textContent = `An SKAO Confluence plugin`;

        footer.appendChild(logo);
        footer.appendChild(text);
        navEl.parentNode.appendChild(footer);
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