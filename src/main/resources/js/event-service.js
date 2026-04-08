/**
 * Service for managing calendar events from Confluence
 *
 * Hierarchy:
 *   subCalendarId (parent)
 *     └─ childSubCalendarId
 *           └─ customEventTypeId  ← keyed in childSubCalendarsByEventId
 *
 * }
 */
class EventService {
    constructor(stationDataManager) {
        this.stationDataManager = stationDataManager;
        this.subCalendarIds = [];
        this.childSubCalendarsByEventId = {};
        this.user = null;
    }

    /**
     * Getter for customEventTypes in the format needed by event-form-manager
     * @returns {Array} Array of event types with {name, id} format
     */
    get customEventTypes() {
        return Object.entries(this.childSubCalendarsByEventId)
            .map(([id, eventType]) => ({ name: eventType.title, id }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Base HTTP request method for Confluence REST API calls.
     * @private
     */
    async _request(url, method = 'GET', body = null) {
        const options = { method };

        if (body) {
            options.headers = {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest"
            };
            options.body = body.toString();
        }

        const response = await fetch(AJS.contextPath() + url, options);
        if (!response.ok) {
            throw new Error(`${method} ${url} failed: ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        return text ? JSON.parse(text) : null;
    }

    /**
     * Loads calendars using IDs read directly from the macro wrapper element's
     * data-calendar-ids attribute. All IDs are stored; each is fetched and its
     * child sub-calendars are parsed into the hierarchy map.
     * @param {HTMLElement} wrapper - The macro wrapper DOM element
     * @returns {Promise<Array>} Array of custom event types
     */
    async loadCalendars(wrapper) {
        const subCalendarIds = (wrapper.dataset.calendarIds || "")
            .split(",")
            .map(id => id.trim())
            .filter(Boolean);

        if (subCalendarIds.length === 0) {
            throw new Error("No calendar IDs found on macro wrapper element");
        }

        this.subCalendarIds = subCalendarIds;

        try {
            await Promise.all(subCalendarIds.map(id => this._loadCalendarById(id)));
            return this.customEventTypes;
        } catch (err) {
            console.error("Calendar loading error:", err);
            throw err;
        }
    }

    /**
     * Fetches a single calendar by ID and parses its child calendars,
     * storing the parent calendarId on each entry.
     * @private
     * @param {string} calendarId - The parent calendar UUID
     * @returns {Promise<void>}
     */
    async _loadCalendarById(subCalendarId) {
        const response = await fetch(
            AJS.contextPath() +
            `/rest/calendar-services/1.0/calendar/subcalendars.json?include=${subCalendarId}`
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch calendar ${subCalendarId}`);
        }

        const data = await response.json();
        const targetPayload = data.payload && data.payload[0];

        if (!targetPayload) {
            throw new Error(`Calendar ${subCalendarId} not found`);
        }

        this._parseChildCalendars(targetPayload.childSubCalendars || []);
    }

    /**
     * Parses child calendar data into the hierarchy map, keyed by customEventTypeId.
     * Each entry records its own childSubCalendarId AND the parent calendarId.
     * @private
     * @param {Array}  childSubCalendars - Array of child calendar objects
     * @param {string} subCalendarId        - The parent calendar UUID
     */
    _parseChildCalendars(childSubCalendars) {
        childSubCalendars.forEach(child => {
            const sub = child.subCalendar;

            if (sub?.customEventTypes?.length) {
                sub.customEventTypes.forEach(type => {
                    this.childSubCalendarsByEventId[type.customEventTypeId] = {
                        title: type.title,
                        childSubCalendarId: sub.id,
                        subCalendarId: sub.parentId,
                        subCalendarTitle: sub.name
                    };
                });
                // if there is no customEventType it uses the type as the key e.g. 'other'
            } else if (sub?.type) {
                const key = `${sub.id}:${sub.type}`;
                this.childSubCalendarsByEventId[key] = {
                    title: sub.type,
                    childSubCalendarId: sub.id,
                    subCalendarId: sub.parentId,
                    subCalendarTitle: sub.name
                };
            }
        });
    }

    /**
     * Looks up the full hierarchy entry for a given customEventTypeId.
     * Throws if the ID is not found, so callers get a clear error rather
     * than silently sending requests with undefined IDs.
     * @private
     * @param {string} customEventTypeId
     * @returns {{ title, childSubCalendarId, calendarId }}
     */
    _getEventTypeEntry(customEventTypeId) {
        const entry = this.childSubCalendarsByEventId[customEventTypeId];
        if (!entry) {
            return
        }
        return entry;
    }

    // ─── Event fetching ────────────────────────────────────────────────────────

    /**
     * Fetches events for a single sub-calendar
     * @param {Object} eventType - Entry from childSubCalendarsByEventId
     * @returns {Promise<Array>} Array of DayPilot event objects
     */
    async _fetchEventsForCalendar(eventType) {
        const today = new DayPilot.Date().getDatePart();
        const start = this._ensureZulu(today.addDays(-365).toString());
        const end = this._ensureZulu(today.addDays(365).toString());

        try {
            const response = await fetch(
                AJS.contextPath() +
                `/rest/calendar-services/1.0/calendar/events.json` +
                `?userTimeZoneId=Australia/Perth` +
                `&subCalendarId=${eventType.childSubCalendarId}` +
                `&start=${start}` +
                `&end=${end}`
            );
            if (!response.ok) {
                console.warn(`Failed to fetch events for ${eventType.title}`);
                return [];
            }
            const data = await response.json();
            return (data.events || []).flatMap(event =>
                this.confluenceEventToDayPilotEvents(event)
            );
        } catch (err) {
            console.error(`Error fetching events for ${eventType.title}:`, err);
            return [];
        }
    }

    /**
     * Fetches all events for all configured calendars
     * @returns {Promise<Array>} Array of DayPilot event objects
     */
    async fetchAllEvents() {
        const allEventsArrays = await Promise.all(
            Object.values(this.childSubCalendarsByEventId)
                .map(eventType => this._fetchEventsForCalendar(eventType))
        );
        return allEventsArrays.flat();
    }

    /**
     * Fetches events for a single calendar by its event type id
     * @param {string} eventId - Key from childSubCalendarsByEventId
     * @returns {Promise<Array>} Array of DayPilot event objects
     */
    async fetchEventsByEventId(eventId) {
        const eventType = this.childSubCalendarsByEventId[eventId];
        if (!eventType) {
            console.warn(`No calendar found for eventId: ${eventId}`);
            return [];
        }
        return this._fetchEventsForCalendar(eventType);
    }

    // ─── Event conversion ──────────────────────────────────────────────────────

    /**
     * Converts a Confluence event to DayPilot events (one per station)
     * NOTE: confluence event field subCalendarId is actually the childSubCalendarId
     * The parent calendarId must be looked up via the hierarchy map
     * @param {Object} event - Confluence event object
     * @returns {Array} Array of DayPilot event objects
     */
    confluenceEventToDayPilotEvents(event) {
        const matchedResources = this.extractResourcesFromEvent(event);
        if (matchedResources.length === 0) return [];

        const { subCalendarId, childSubCalendarId } =
            this._getEventTypeEntry(event.customEventTypeId || `${event.subCalendarId}:${event.eventType}`);

        return matchedResources.map(resourceId => ({
            id: this.makeEventId(event.id, resourceId),
            confluenceId: event.id,
            creator: event.invitees ? event.invitees[0].displayName : null,
            text: event.title,
            start: this.removeTZ(event.start),
            // All-day event handling since confluence end time is incorrect
            end: event.allDay ? DayPilot.Date(this.removeTZ(event.end)).addDays(1) : this.removeTZ(event.end),
            description: event.description,
            resource: resourceId,
            barColor: event.borderColor,
            customEventTypeId: event.customEventTypeId,
            eventType: event.eventType,
            childSubCalendarId: childSubCalendarId,
            subCalendarId: subCalendarId,
            rruleStr: event.rruleStr,
            originalStartDateTime: this.removeTZ(event.originalStartDateTime),
            originalEndDateTime: this.removeTZ(event.originalEndDateTime)
        }));
    }

    /**
     * Extracts station IDs mentioned in event title, description or where field
     * @param {Object} event - Confluence Event object
     * @returns {Array<string>} Array of matching station IDs
     */
    extractResourcesFromEvent(event) {
        const stationIds = this.stationDataManager.getAllStationLabels();
        // use where field preferably, otherwise check both title and description
        // filter out EMS generated cluster where fields since they are not specific/accurate
        const haystack = event.where && !event.where.includes("Cluster (") ? event.where
            : (event.title ?? '') + ' ' + (event.description ?? '');

        const normalisedHaystack = haystack
            .replace(/\bS0*(\d+)/gi, 'S$1') //removing leading zeros (e.g. S08 → S8)
            .replace(/\s*-\s*/g, '-') // removing spaces around dashes (e.g. S8 - 1 → S8-1)
            .toUpperCase();

        const matched = new Set();

        // --- Rule 1: AA phase matching (can allow for flexible matching) ---
        const PHASE_MAP = {
            'AA0.5': ['AA0.5'],
            'AA1': ['AA1'],
        };
        const phaseMatches = normalisedHaystack.match(/\bAA(0\.5|1)\b/gi) ?? [];
        for (const phase of phaseMatches) {
            const phasesToInclude = PHASE_MAP[phase.toUpperCase()] ?? [phase];
            for (const p of phasesToInclude) {
                for (const s of this.stationDataManager.getStationsByPhase(p)) {
                    matched.add(s.Label);
                }
            }
        }

        // --- Rule 2: Bare S8 / S9 / S10 → wildcard to all S8-x, S9-x, S10-x ---
        const bareGroupMatches = normalisedHaystack.match(/\bS(10|[89])(?!-\d)\b/gi) ?? [];
        for (const bare of bareGroupMatches) {
            const prefix = bare.toUpperCase() + '-';
            for (const id of stationIds) {
                if (id.toUpperCase().startsWith(prefix)) matched.add(id);
            }
        }

        // --- Rule 3: direct label matching ---
        for (const stationId of stationIds) {
            if (normalisedHaystack.includes(stationId.toUpperCase())) matched.add(stationId);
        }

        return [...matched];
    }

    // ─── Create / Update / Delete ──────────────────────────────────────────────

    /**
     * Sends a create, update, or delete request for a Confluence calendar event
     * @param {Object} body   - Event payload as key-value pairs
     * @param {string} method - 'PUT' for create/update, 'DELETE' for delete
     * @returns {Promise<Object>} Parsed JSON response
     */
    async requestEvent(body, method = 'PUT') {
        const formData = new URLSearchParams();
        for (const [key, value] of Object.entries(body)) {
            if (value !== undefined && value !== null) formData.append(key, value);
        }
        return this._request('/rest/calendar-services/1.0/calendar/events.json', method, formData);
    }

    /**
     * Builds event payload for create/update operations.
     * subCalendarId and childSubCalendarId are now derived from the
     * customEventTypeId via the hierarchy map rather than a single hardcoded ID.
     * @private
     * @param {Object}      formData      - Event form data
     * @param {Object|null} existingEvent - Existing DayPilot event (null for creates)
     * @returns {Object} Event payload object
     */
    _buildEventPayload(formData, existingEvent = null) {
        // Derive parent calendarId and childSubCalendarId from the chosen event type
        const entry = this._getEventTypeEntry(formData.customEventTypeId);
        const subCalendarId = entry?.subCalendarId || existingEvent?.subCalendarId;
        const childSubCalendarId = entry?.childSubCalendarId || existingEvent?.childSubCalendarId;

        const payload = {
            what: formData.text,
            person: this.user.userKey,
            customEventTypeId: formData.customEventTypeId,
            subCalendarId: subCalendarId,
            childSubCalendarId: childSubCalendarId,
            startDate: this.convertToConfluenceDate(formData.start),
            endDate: this.convertToConfluenceDate(formData.end),
            startTime: this.convertToConfluenceTime(formData.start),
            endTime: this.convertToConfluenceTime(formData.end),
            where: formData.resource,
            description: formData.description,
            eventType: "custom",
            userTimeZoneId: "Australia/Perth",
            rruleStr: formData.rruleStr || "",
            until: formData.until || "",
            editAllInRecurrenceSeries: formData.editAllInRecurrenceSeries || false,
        };

        if (existingEvent) {
            payload.uid = existingEvent.confluenceId;
            payload.originalSubCalendarId = existingEvent.subCalendarId;
            payload.originalEventSubCalendarId = existingEvent.childSubCalendarId;
            payload.originalCustomEventTypeId = existingEvent.customEventTypeId;
            payload.originalEventType = existingEvent.eventType;

            if (this.isRecurring(existingEvent)) {
                payload.originalStartDate = existingEvent.confluenceId.split("/")[0];
            }
        }

        return payload;
    }

    /**
     * Creates a new Confluence event
     * @param {Object} formData - Event form data
     * @returns {Promise<Object>} Created event or null on error
     */
    async createEvent(formData) {
        try {
            return await this.requestEvent(this._buildEventPayload(formData));
        } catch (err) {
            console.error("Create event error:", err);
            return null;
        }
    }

    /**
     * Updates an existing Confluence event
     * @param {Object} formData       - Event form data
     * @param {Object} existingEvent  - Existing event object
     * @returns {Promise<void>}
     */
    async updateEvent(formData, existingEvent) {
        const confluenceEvent = this._buildEventPayload(formData, existingEvent);

        try {
            await this.requestEvent(confluenceEvent);
            if (this.isRecurring(existingEvent)) {
                await this.deleteHiddenEvents(confluenceEvent);
            }
        } catch (err) {
            console.error("Update event error:", err);
            throw err;
        }
    }

    /**
     * Deletes an existing Confluence event, with optional scope for series
     * @param {Object} existingEvent - Existing event object
     * @param {string} scope         - 'single' | 'future' | 'series'
     * @returns {Promise<void>}
     */
    async deleteEvent(existingEvent, scope = "single") {
        const payload = {
            subCalendarId: existingEvent.childSubCalendarId,
            uid: existingEvent.confluenceId,
        };

        if (this.isRecurring(existingEvent)) {
            switch (scope) {
                case "single":
                    payload.originalStart = existingEvent.confluenceId.split("/")[0];
                    payload.singleInstance = true;
                    payload.recurrenceId = "";
                    break;
                case "future":
                    payload.recurUntil = existingEvent.confluenceId.split("T")[0].replaceAll("-", "");
                    break;
                case "series":
                    // no extra fields needed
                    break;
            }
        }

        try {
            await this.requestEvent(payload, 'DELETE');
            if (this.isRecurring(existingEvent) && scope !== "single") {
                await this.deleteHiddenEvents(existingEvent);
            }
        } catch (err) {
            console.error("Delete event error:", err);
            throw err;
        }
    }

    // ─── Utilities ─────────────────────────────────────────────────────────────

    /**
     * Fetches and stores the current Confluence user
     * @returns {Promise<void>}
     */
    async getCurrentUser() {
        this.user = await this._request('/rest/api/user/current');
    }

    /**
     * Required to push through edits to recurring event updates
     * @param {Object} event - Event just edited
     * @returns {Promise<Object>} Response from server
     */
    async deleteHiddenEvents(event) {
        const formData = new URLSearchParams();
        formData.append("subCalendarId", event.childSubCalendarId);
        formData.append("subCalendarId", event.subCalendarId);
        return this._request(
            '/rest/calendar-services/1.0/calendar/preferences/events/hidden.json',
            'DELETE',
            formData
        );
    }

    /**
     * Removes the timezone component from a Confluence date string
     * @param {string} dateString - ISO date string potentially containing a timezone offset
     * @returns {DayPilot.Date} DayPilot date with timezone stripped
     */
    removeTZ(dateString) {
        return new DayPilot.Date(dateString.split("+")[0]);
    }

    /**
     * Formats a date using Intl.DateTimeFormat
     * @private
     */
    _formatDateWithIntl(dateString, options, timeZone = "Australia/Perth") {
        const dateObject = new Date(dateString);
        return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).format(dateObject);
    }

    /**
     * Converts date string to Confluence date format
     * @param {string} dateString - ISO date string
     * @returns {string} Formatted date
     */
    convertToConfluenceDate(dateString) {
        if (dateString.value) dateString = dateString.value;   // DatePicker object guard
        return this._formatDateWithIntl(dateString, {
            year: 'numeric', month: 'long', day: 'numeric'
        });
    }

    /**
     * Converts date string to Confluence time format
     * @param {string} dateString - ISO date string
     * @returns {string} Formatted time
     */
    convertToConfluenceTime(dateString) {
        return this._formatDateWithIntl(dateString, {
            hour: 'numeric', minute: '2-digit', hour12: true
        });
    }

    /**
     * Creates unique event ID combining Confluence ID and resource ID
     */
    makeEventId(confluenceId, resourceId) {
        return `${confluenceId}:${resourceId}`;
    }

    /**
     * Ensures date string ends with Z (Zulu/UTC timezone)
     * @private
     */
    _ensureZulu(s) {
        return s.replace(/Z?$/, "Z");
    }

    /**
     * Checks if an event is part of a recurring series
     */
    isRecurring(event) {
        return Boolean(event.rruleStr);
    }
}

window.EventService = EventService;