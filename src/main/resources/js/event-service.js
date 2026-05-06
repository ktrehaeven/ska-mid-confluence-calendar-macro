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
    constructor(dishDataManager) {
        this.dishDataManager = dishDataManager;
        this.customEventTypesList = [
        { id: "type-meeting", title: "Meeting" },
        { id: "type-booking", title: "Booking" },
        { id: "type-maintenance", title: "Maintenance" },
        { id: "type-other", title: "Other" },
        ];
        this.user = null;
    }

    /**
     * Getter for customEventTypes in the format needed by event-form-manager
     * @returns {Array} Array of event types with {name, id} format
     */
    get customEventTypes() {
        return this.customEventTypesList
            .map(eventType => ({ name: eventType.title, id: eventType.id }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
    * Add a new custom event type
    */
    addCustomEventType(id, title) {
        if (!this.customEventTypesList.find(t => t.id === id)) {
            this.customEventTypesList.push({ id, title });
        }
    }

    /**
     * Remove a custom event type
     */
    removeCustomEventType(id) {
        this.customEventTypesList = this.customEventTypesList.filter(t => t.id !== id);
    }

    /**
     * Get all custom event types
     */
    getAllCustomEventTypes() {
        return this.customEventTypesList;
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


    // ─── Utilities ─────────────────────────────────────────────────────────────

    /**
     * Fetches and stores the current Confluence user
     * @returns {Promise<void>}
     */
    async getCurrentUser() {
        const user = await this._request('/rest/api/user/current');
        this.user = user;
        return user;
    }

    /**
     * Creates a seriesUUID (generated once per booking)
     * This UUID is shared by all events from the same series,
     * making them siblings with different resourceIds.
     * @returns {string} The unique UUID for this service instance
     */
    createSeriesUUID() {
        return crypto.randomUUID();
    }

    /**
     * Creates unique event ID combining the stored instance UUID and resource ID.
     * All events from the same instance share the same UUID prefix
     */
    makeEventId(seriesUuid, resourceId) {
        return `${seriesUuid}:${resourceId}`;
    }

    /**
     * Extracts the UUID prefix from an event ID
     * Useful for finding the shared UUID among sibling events.
     * 
     * @param {string} eventId - Full event ID in format "uuid:resourceId"
     * @returns {string} Just the UUID part before the colon
     */
    getUUIDFromEventId(eventId) {
        return eventId.split(':')[0];
    }
 
    /**
     * Extracts the resourceId from an event ID
     * 
     * @param {string} eventId - Full event ID in format "uuid:resourceId"
     * @returns {string} Just the resourceId part after the colon
     */
    getResourceIdFromEventId(eventId) {
        return eventId.split(':')[1];
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