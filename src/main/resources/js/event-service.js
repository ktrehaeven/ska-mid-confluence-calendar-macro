/**
 * Service for managing calendar events from Confluence
 */
class EventService {
    constructor(stationDataManager) {
        this.stationDataManager = stationDataManager;
        this.skaConstructionCalId = null;
        this.childSubCalendarIds = {};
        this.customEventTypes = [];
    }

    /**
     * Fetches all child calendars and event types
     * @returns {Promise<Object>} Dictionary of child calendar IDs
     */
    async loadCalendars() {
        const skaConstructionCalName = "SKA-Low Telescope Construction";

        try {
            const response = await fetch(
                AJS.contextPath() + "/rest/calendar-services/1.0/calendar/subcalendars.json?"
            );

            if (!response.ok) {
                throw new Error('Failed to fetch calendars');
            }

            const data = await response.json();
            const targetPayload = data.payload.find(
                entry => entry.subCalendar && entry.subCalendar.name === skaConstructionCalName
            );

            if (!targetPayload) {
                throw new Error(`Calendar "${skaConstructionCalName}" not found`);
            }

            this.skaConstructionCalId = targetPayload.subCalendar.id;
            this._parseChildCalendars(targetPayload.childSubCalendars);

            return this.childSubCalendarIds;
        } catch (err) {
            console.error("Calendar loading error:", err);
            throw err;
        }
    }

    /**
     * Parses child calendar data
     * @private
     * @param {Array} childSubCalendars - Array of child calendar objects
     */
    _parseChildCalendars(childSubCalendars) {
        this.childSubCalendarIds = Object.fromEntries(
            childSubCalendars.flatMap(child => {
                const sub = child.subCalendar;
                if (!sub?.customEventTypes?.length) return [];
                return sub.customEventTypes.map(type => [type.title, sub.id]);
            })
        );

        this.customEventTypes = childSubCalendars.flatMap(child => {
            const sub = child.subCalendar;
            if (!sub?.customEventTypes?.length) return [];
            return sub.customEventTypes.map(type => ({
                name: type.title,
                id: type.customEventTypeId
            }));
        });
    }

    /**
     * Fetches all events for the configured calendars
     * @returns {Promise<Array>} Array of DayPilot event objects
     */
    async fetchAllEvents() {
        const today = new DayPilot.Date().getDatePart();
        const start = this._ensureZulu(today.addDays(-365).toString());
        const end = this._ensureZulu(today.addDays(365).toString());

        const fetchPromises = Object.entries(this.childSubCalendarIds).map(
            async ([name, id]) => {
                try {
                    const response = await fetch(
                        AJS.contextPath() +
                        `/rest/calendar-services/1.0/calendar/events.json` +
                        `?subCalendarId=${id}` +
                        `&start=${start}` +
                        `&end=${end}`
                    );

                    if (!response.ok) {
                        console.warn(`Failed to fetch events for ${id}`);
                        return [];
                    }

                    const data = await response.json();
                    return (data.events || []).flatMap(event =>
                        this.confluenceEventToDayPilotEvents(event)
                    );
                } catch (err) {
                    console.error(`Error fetching events for ${name}:`, err);
                    return [];
                }
            }
        );

        const allEventsArrays = await Promise.all(fetchPromises);
        return allEventsArrays.flat();
    }

    /**
     * Converts a Confluence event to DayPilot events (one per station)
     * @param {Object} event - Confluence event object
     * @returns {Array} Array of DayPilot event objects
     */
    confluenceEventToDayPilotEvents(event) {
        const matchedResources = this.extractResourcesFromEvent(event);

        if (matchedResources.length === 0) {
            return [];
        }

        return matchedResources.map(resourceId => ({
            id: this.makeEventId(event.id, resourceId),
            confluenceId: event.id,
            text: event.title,
            start: this.applyTimezoneOffset(new Date(event.start)),
            end: this.applyTimezoneOffset(new Date(event.end)),
            description: event.description,
            resource: resourceId,
            barColor: "#070068",
            eventType: event.customEventTypeId,
        }));
    }

    /**
     * Extracts station IDs mentioned in event title or description
     * @param {Object} event - Event object
     * @returns {Array<string>} Array of matching station IDs
     */
    extractResourcesFromEvent(event) {
        const stationIds = this.stationDataManager.getAllStationLabels();
        const haystack = (event.title || "") + " " + (event.description || "");

        return stationIds.filter(stationId =>
            haystack.toUpperCase().includes(stationId.toUpperCase())
        );
    }

    /**
     * Applies timezone offset to a date
     * @param {Date} dt - Date object
     * @returns {Date} Adjusted date
     */
    applyTimezoneOffset(dt) {
        return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
    }

    /**
     * Posts a new event or updates an existing one
     * @param {Object} body - Event data to post
     * @returns {Promise<Object>} Response from server
     */
    async postEvent(body) {
        const url = AJS.contextPath() + "/rest/calendar-services/1.0/calendar/events.json";
        const formData = new URLSearchParams();

        for (const [key, value] of Object.entries(body)) {
            if (value !== undefined && value !== null) {
                formData.append(key, value);
            }
        }

        try {
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: formData.toString()
            });

            if (!response.ok) {
                throw new Error(`Failed to post event: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (err) {
            console.error("Event posting error:", err);
            throw err;
        }
    }

    /**
     * Builds event payload for create/update operations
     * @private
     * @param {Object} eventData - Event form data
     * @param {string|null} confluenceId - Confluence event ID (null for new events)
     * @returns {Object} Event payload object
     */
    _buildEventPayload(eventData, confluenceId = null) {
        const eventExists = (confluenceId != null);

        const payload = {
            what: eventData.text,
            customEventTypeId: eventData.type,
            subCalendarId: this.skaConstructionCalId,
            startDate: this.convertToConfluenceDate(eventData.start.value),
            endDate: this.convertToConfluenceDate(eventData.end.value),
            startTime: this.convertToConfluenceTime(eventData.start.value),
            endTime: this.convertToConfluenceTime(eventData.end.value),
            description: eventExists ? eventData.description : this.buildDescription(eventData),
            eventType: "custom",
            userTimeZoneId: "Australia/Perth",
        };

        if (eventExists) {
            payload.uid = confluenceId;
        }

        return payload;
    }

    /**
     * Creates a new Confluence event
     * @param {Object} eventData - Event form data
     * @returns {Promise<Object>} Created event or null on error
     */
    async createEvent(eventData) {
        const confluenceEvent = this._buildEventPayload(eventData);

        try {
            return await this.postEvent(confluenceEvent);
        } catch (err) {
            console.error("Create event error:", err);
            return null;
        }
    }

    /**
     * Updates an existing Confluence event
     * @param {Object} eventData - Event form data
     * @param {Object} existingEvent - Existing event object
     * @returns {Promise<Object>} Updated event response
     */
    async updateEvent(eventData, existingEvent) {
        const confluenceEvent = this._buildEventPayload(eventData, existingEvent.confluenceId);

        try {
            return await this.postEvent(confluenceEvent);
        } catch (err) {
            console.error("Update event error:", err);
            throw err;
        }
    }

    /**
     * Builds description including station information
     * @private
     * @param {Object} eventData - Event data
     * @returns {string} Description with stations
     */
    buildDescription(eventData) {
        const resources = Array.isArray(eventData.resource) ? eventData.resource : [eventData.resource];
        const resourceStr = resources.filter(Boolean).join(", ");
        return eventData.description.includes(resourceStr) ?
            eventData.description : resourceStr + "\n\n" + eventData.description;
    }

    /**
     * Formats a date using Intl.DateTimeFormat
     * @private
     * @param {string} dateString - ISO date string
     * @param {Object} options - Intl.DateTimeFormat options
     * @returns {string} Formatted date/time
     */
    _formatDateWithIntl(dateString, options) {
        const dateObject = new Date(dateString);
        return new Intl.DateTimeFormat('en-US', options).format(dateObject);
    }

    /**
     * Converts date string to Confluence date format
     * @param {string} dateString - ISO date string
     * @returns {string} Formatted date
     */
    convertToConfluenceDate(dateString) {
        return this._formatDateWithIntl(dateString, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    /**
     * Converts date string to Confluence time format
     * @param {string} dateString - ISO date string
     * @returns {string} Formatted time
     */
    convertToConfluenceTime(dateString) {
        return this._formatDateWithIntl(dateString, {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }

    /**
     * Normalizes resource/station identifiers into a consistent array format
     * @param {string|Array<string>} resource - Single resource or array of resources
     * @returns {Array<string>} Normalized array of resource IDs
     */
    normalizeResources(resource) {
        const resources = Array.isArray(resource) ? resource : [resource];
        return resources.map(r => String(r)).filter(Boolean);
    }

    /**
     * Creates unique event ID combining Confluence ID and resource ID
     * @param {string} confluenceId - Confluence event ID
     * @param {string} resourceId - Resource/station ID
     * @returns {string} Combined ID
     */
    makeEventId(confluenceId, resourceId) {
        return `${confluenceId}:${resourceId}`;
    }

    /**
     * Ensures date string ends with Z (Zulu/UTC timezone)
     * @private
     * @param {string} s - Date string
     * @returns {string} Date string ending with Z
     */
    _ensureZulu(s) {
        return s.replace(/Z?$/, "Z");
    }
}
