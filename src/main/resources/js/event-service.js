/**
 * Service for managing calendar events from Confluence
 */
class EventService {
    constructor(stationDataManager) {
        this.stationDataManager = stationDataManager;
        this.skaConstructionCalId = null;
        this.childSubCalendarsByEventId = {};
    }

    /**
     * Getter for customEventTypes in the format needed by event-form-manager
     * @returns {Array} Array of event types with {name, id} format
     */
    get customEventTypes() {
        return Object.entries(this.childSubCalendarsByEventId).map(([id, eventType]) => ({
            name: eventType.title,
            id: id
        }));
    }

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

            return this.customEventTypes;
        } catch (err) {
            console.error("Calendar loading error:", err);
            throw err;
        }
    }

    /**
     * Parses child calendar data into a consolidated object with title, childSubCalendarId, and customEventTypeId
     * @private
     * @param {Array} childSubCalendars - Array of child calendar objects
     */
    _parseChildCalendars(childSubCalendars) {
        childSubCalendars.forEach(child => {
            const sub = child.subCalendar;

            if (sub?.customEventTypes?.length) {
                sub.customEventTypes.forEach(type => {
                    this.childSubCalendarsByEventId[type.customEventTypeId] = {
                        title: type.title,
                        childSubCalendarId: sub.id,
                    };
                });
            } else if (sub?.type) {
                // if no customEventTypes, include an entry using sub.type
                // Note: we need a custom event type ID in this case - using type as fallback
                this.childSubCalendarsByEventId[sub.type] = {
                    title: sub.type,
                    childSubCalendarId: sub.id,
                };
            }
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

        const fetchPromises = Object.values(this.childSubCalendarsByEventId).map(
            async (eventType) => {
                try {
                    const response = await fetch(
                        AJS.contextPath() +
                        `/rest/calendar-services/1.0/calendar/events.json` +
                        `?subCalendarId=${eventType.childSubCalendarId}` +
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
                    console.error(`Error fetching events for ${eventType.title}:`, err);
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
            creator: event.invitees ? event.invitees[0].displayName : null,
            text: event.title,
            start: this.removeTZ(event.start),
            end: this.removeTZ(event.end),
            description: event.description,
            resource: resourceId,
            barColor: "#070068",
            customEventTypeId: event.customEventTypeId,
            childSubCalendarId: event.subCalendarId,
            rruleStr: event.rruleStr,
        }));
    }

    /**
     * Extracts station IDs mentioned in event title or description
     * @param {Object} event - Confluence Event object
     * @returns {Array<string>} Array of matching station IDs
     */
    extractResourcesFromEvent(event) {
        const stationIds = this.stationDataManager.getAllStationLabels();
        const haystack = event.where ? event.where : (event.title) + (event.description);

        return stationIds.filter(stationId =>
            haystack.toUpperCase().includes(stationId.toUpperCase())
        );
    }

    /**
     * Applies timezone offset to a date
     * @param {Date} dt - Date object
     * @returns {Date} Adjusted date
     */
    removeTZ(dateString) {
        return new DayPilot.Date(dateString.split("+")[0])
    }

    /**
     * Posts a new event or updates an existing one
     * @param {Object} body - Event data to post
     * @param {string} method - HTTP method ('PUT' for create/update, 'DELETE' for delete)
     * @returns {Promise<Object>} Response from server
     */
    async requestEvent(body, method = 'PUT') {
        const url = AJS.contextPath() + "/rest/calendar-services/1.0/calendar/events.json";
        const formData = new URLSearchParams();

        for (const [key, value] of Object.entries(body)) {
            if (value !== undefined && value !== null) {
                formData.append(key, value);
            }
        }

        try {
            const response = await fetch(url, {
                method: method,
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
     * get confluence user
     * @returns {Promise<Object>} Response from server
     */
    async getCurrentUser() {
        //rest/api/user/list?start=2000&limit=200

        const url = AJS.contextPath() + "/rest/api/user/current";

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to post event: ${response.status} ${response.statusText}`);
            }

            return response.json();
        } catch (err) {
            console.error("Event getting user:", err);
            throw err;
        }
    }

    /**
     * required to push through edits to recurring event updates
     * @param {Object} event - Event just edited
     * @param {string} method - HTTP method ('PUT' for create/update, 'DELETE' for delete)
     * @returns {Promise<Object>} Response from server
     */
    async deleteHiddenEvents(event, method = 'DELETE') {
        const url = AJS.contextPath() + "/rest/calendar-services/1.0/calendar/preferences/events/hidden.json";
        const formData = new URLSearchParams();

        formData.append("subCalendarId", event.childSubCalendarId);
        formData.append("subCalendarId", this.skaConstructionCalId);

        try {
            const response = await fetch(url, {
                method: method,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: formData.toString()
            });
            if (!response.ok) {
                throw new Error(`Failed to post event: ${response.status} ${response.statusText}`);
            }

            return response;
        } catch (err) {
            console.error("Event posting error:", err);
            throw err;
        }
    }

    /**
     * Builds event payload for create/update operations
     * @private
     * @param {Object} formData - Event form data
     * @param {string|null} confluenceId - Confluence event ID (null for new events)
     * @returns {Object} Event payload object
     */
    _buildEventPayload(formData, existingEvent = null) {
        const payload = {
            what: formData.text,
            // creator
            customEventTypeId: formData.customEventTypeId,
            subCalendarId: this.skaConstructionCalId,
            startDate: this.convertToConfluenceDate(formData.start),
            endDate: this.convertToConfluenceDate(formData.end),
            startTime: this.convertToConfluenceTime(formData.start),
            endTime: this.convertToConfluenceTime(formData.end),
            where: formData.resource,
            description: formData.description,
            eventType: "custom",
            userTimeZoneId: "Australia/Perth",
        };

        if (existingEvent) {
            payload.uid = existingEvent.confluenceId;

            if (existingEvent.rruleStr) {
                payload.originalSubCalendarId = this.skaConstructionCalId;
                payload.originalEventSubCalendarId = existingEvent.childSubCalendarId;
                payload.originalCustomEventTypeId = existingEvent.customEventTypeId;
                payload.originalStartDate = existingEvent.confluenceId.split("/")[0];
                payload.originalEventType = existingEvent.eventType;
                payload.childSubCalendarId = (this.childSubCalendarsByEventId
                [formData.customEventTypeId].childSubCalendarId);
                payload.rruleStr = existingEvent.rruleStr;
                payload.editAllInRecurrenceSeries = "false";
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
        const confluenceEvent = this._buildEventPayload(formData);

        try {
            return await this.requestEvent(confluenceEvent);
        } catch (err) {
            console.error("Create event error:", err);
            return null;
        }
    }

    /**
     * Updates an existing Confluence event
     * @param {Object} formData - Event form data
     * @param {Object} existingEvent - Existing event object
     * @returns {Promise<Object>} Updated event response
     */
    async updateEvent(formData, existingEvent) {
        const confluenceEvent = this._buildEventPayload(formData, existingEvent);

        try {
            await this.requestEvent(confluenceEvent);
            if (existingEvent.rruleStr) {
                await this.deleteHiddenEvents(confluenceEvent);
            }
        } catch (err) {
            console.error("Update event error:", err);
            throw err;
        }
    }

    /**
     * Deletes an existing Confluence event
     * @param {Object} existingEvent - Existing event object
     * @returns {Promise<Object>} Updated event response
     */
    async deleteEvent(existingEvent) {

        const payload = {
            subCalendarId: existingEvent.childSubCalendarId,
            uid: existingEvent.confluenceId,
        };
        if (existingEvent.rruleStr) {
            payload.originalStart = existingEvent.confluenceId.split("/")[0],
                payload.singleInstance = true,
                payload.recurrenceId = ""
        }

        try {
            return await this.requestEvent(payload, 'DELETE');
        } catch (err) {
            console.error("Delete event error:", err);
            throw err;
        }
    }

    /**
     * Formats a date using Intl.DateTimeFormat
     * @private
     * @param {string} dateString - ISO date string
     * @param {Object} options - Intl.DateTimeFormat options
     * @returns {string} Formatted date/time
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
        // catch for if dateString is a DatePicker object
        if (dateString.value) {
            dateString = dateString.value;
        }

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
