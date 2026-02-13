/**
 * Manages the event form display and submission
 */
class EventFormManager {
    constructor(eventService, stationDataManager) {
        this.eventService = eventService;
        this.stationDataManager = stationDataManager;
    }

    /**
     * Displays the event form modal and returns the result
     * @param {Object} data - Initial form data
     * @returns {Promise<Object|null>} Form result or null if cancelled
     */
    async show(data) {
        const preSelectedStations = Array.isArray(data.resource) ?
            data.resource : [data.resource].filter(Boolean);

        const eventForm = this._buildFormDefinition(preSelectedStations);

        const modal = await DayPilot.Modal.form(eventForm, data, {
            width: 450,
            scrollWithPage: true,
            autoStretch: true,
            zIndex: 100,
            onClose: (modal) => this._handleFormClose(modal)
        });

        if (modal.canceled) return null;
        return modal.result;
    }

    /**
     * Builds the form field definitions
     * @private
     * @param {Array<string>} preSelectedStations - Pre-selected station labels
     * @returns {Array} Form field definitions
     */
    _buildFormDefinition(preSelectedStations) {
        return [
            { name: "Title", id: "text", type: "text" },
            { name: "Creator", id: "creator", type: "text", disabled: true },
            {
                name: "Event Type",
                id: "customEventTypeId",
                options: this.eventService.customEventTypes,
                type: "select"
            },
            { name: "Start", id: "start", type: "datetime", timeInterval: 1 },
            { name: "End", id: "end", type: "datetime", timeInterval: 1 },
            this._buildStationSelect(preSelectedStations),
            { name: "Description", id: "description", type: "textarea", height: 70 }
        ];
    }

    /**
     * Builds the station multi-select field
     * @private
     * @param {Array<string>} preSelectedStations - Pre-selected stations
     * @returns {Object} Station select field definition
     */
    _buildStationSelect(preSelectedStations) {
        const phaseFilters = ["AA1", "AA0.5", "AAVS3"];
        const stations = this.stationDataManager.getStationsByPhase(phaseFilters);

        const optionsHtml = stations
            .map(station => {
                const selected = preSelectedStations.includes(station.Label) ? 'selected' : '';
                return `<option value="${station.Label}" ${selected}>${station.Label}</option>`;
            })
            .join("");

        return {
            name: "Stations",
            id: "text",
            type: "html",
            html: `<select id="station-multiselect" multiple size="18" style="width:100%;">
                ${optionsHtml}
                </select>`
        };
    }

    /**
     * Handles form close event and captures station selection
     * @private
     * @param {Object} modal - Modal object
     */
    _handleFormClose(modal) {
        const selectEl = document.getElementById("station-multiselect");
        if (selectEl && modal.result) {
            modal.result.resource = Array.from(selectEl.selectedOptions)
                .map(opt => opt.value);
        }
    }
}
