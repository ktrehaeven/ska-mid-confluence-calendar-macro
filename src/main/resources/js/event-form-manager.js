class EventFormManager {
    constructor(eventService, stationDataManager) {
        this.eventService = eventService;
        this.stationDataManager = stationDataManager;
    }

    /**
     * Opens the event form modal prepopulated with the given event data.
     * Sets up station and series listeners after the DOM renders via setTimeout.
     * @param {Object} data - Event data to prepopulate the form with
     * @param {Array} eventsList - All calendar events, used to determine station availability
     * @returns {Promise<Object|null>} The submitted form result, or null if the modal was canceled
     */
    async show(data, eventsList = []) {
        const eventForm = this._buildFormDefinition(data, eventsList);

        setTimeout(() => {
            this._setupStationListeners();
            this._setupEditSeriesListener(data);
        }, 0);

        const modal = await DayPilot.Modal.form(eventForm, data, {
            width: 450,
            scrollWithPage: false,
            autoStretch: true,
            zIndex: 1000,
            onClose: (modal) => this._handleFormClose(modal)
        });
        if (modal.canceled) return null;
        return modal.result;
    }

    /**
     * Builds the DayPilot form field definitions for the event modal.
     * Includes event type, title, creator, start/end datetimes, recurrence editing,
     * station selection, and description.
     * @param {Object} data - Event data used to prepopulate and configure fields
     * @param {Array} eventsList - All calendar events, passed through to the station select for availability indicators
     * @returns {Array} Array of DayPilot form field definition objects
     */
    _buildFormDefinition(data, eventsList = []) {
        return [
            {
                name: "Event Type",
                id: "customEventTypeId",
                // filters all default confluence event types
                options: this.eventService.customEventTypes.filter(type => type.name !== type.id),
                type: "select"
            },
            { name: "Title (required)", id: "text", type: "text" },
            { name: "Creator", id: "creator", type: "text", disabled: true },
            { name: "Start", id: "start", type: "datetime", timeInterval: 1, dateFormat: "dd/MM/yyyy" },
            { name: "End", id: "end", type: "datetime", timeInterval: 1, dateFormat: "dd/MM/yyyy" },
            { name: "Edit entire series", id: "editAllInRecurrenceSeries", type: "checkbox", disabled: !this.eventService.isRecurring(data) },
            this._buildStationSelect(data, eventsList),
            { name: "Description", id: "description", type: "textarea", height: 70 }
        ];
    }

    /**
     * Checks if a station has a conflicting event in the given time range.
     * @param {string} stationLabel - The station identifier to check
     * @param {DayPilot.Date|string} start - Start of the time range
     * @param {DayPilot.Date|string} end - End of the time range
     * @param {Array} eventsList - List of calendar events to check against
     * @returns {boolean} True if the station has an overlapping event
     */
    _isStationBusy(stationLabel, start, end, eventsList = []) {
        const startTime = new DayPilot.Date(start).getTime();
        const endTime = new DayPilot.Date(end).getTime();

        return eventsList.some(ev => {
            if (ev.resource !== stationLabel) return false;

            const evStart = new DayPilot.Date(ev.start).getTime();
            const evEnd = new DayPilot.Date(ev.end).getTime();

            // Overlap check: events overlap if one starts before the other ends
            return evStart < endTime && evEnd > startTime;
        });
    }

    /**
     * Builds the station selection HTML form field, including phase and cluster filters.
     * Stations are marked with availability indicators based on the given time range.
     * @param {Object} data - Event data containing resource, start, and end properties
     * @param {Array} eventsList - List of calendar events used to determine station availability
     * @returns {Object} DayPilot form field definition with type "html"
     */
    _buildStationSelect(data, eventsList = []) {
        const phaseFilters = ["Airstrip", "AAVS3", "AA0.5", "AA1"];
        const clusterFilters = ["S8", "S9", "S10"];
        const stations = this.stationDataManager.getStationsByPhase(phaseFilters);

        const phaseOptionsHtml = phaseFilters.map(phase =>
            `<option value="${phase}">${phase}</option>`
        ).join("");

        const clusterOptionsHtml = clusterFilters.map(cluster =>
            `<option value="${cluster}">${cluster}</option>`
        ).join("");

        const stationOptionsHtml = stations.map(station => {
            const selected = data.resource.includes(station.Label) ? 'selected' : '';
            const busy = data.start && data.end ? this._isStationBusy(station.Label, data.start, data.end, eventsList) : false;
            const dot = busy ? '🔴' : '🟢';
            const cluster = clusterFilters.find(c => station.Label.startsWith(c)) ?? '';
            return `<option value="${station.Label}" data-phase="${station.Phase}" data-cluster="${cluster}" ${selected}>${dot} ${station.Label}</option>`;
        }).join("");

        const html = `
        <div style="display:flex; gap:12px; width:100%;">
            <div style="flex:0 0 100px;">
                <div style="font-size:14px; font-weight:400; margin-bottom:4px;">Phase</div>
                <select id="phase-multiselect" multiple size="19" style="width:100%;">
                    ${phaseOptionsHtml}
                </select>
            </div>
            <div style="flex:0 0 100px;">
                <div style="font-size:14px; font-weight:400; margin-bottom:4px;">Cluster</div>
                <select id="cluster-multiselect" multiple size="19" style="width:100%;">
                    ${clusterOptionsHtml}
                </select>
            </div>
            <div style="flex:1;">
                <div style="font-size:14px; font-weight:400; margin-bottom:4px;">Stations</div>
                <select id="station-multiselect" multiple size="18" style="width:100%;">
                    ${stationOptionsHtml}
                </select>
            </div>
        </div>
    `;

        return {
            name: "Stations",
            id: "text",
            type: "html",
            html
        };
    }

    /**
     * Attaches change listeners to the phase, cluster, and station multiselects.
     * Selecting a phase or cluster updates station selections accordingly and clears the other filter.
     * Selecting a station directly clears both phase and cluster selections.
     */
    _setupStationListeners() {
        const phaseSelect = document.getElementById('phase-multiselect');
        const clusterSelect = document.getElementById('cluster-multiselect');
        const stationSelect = document.getElementById('station-multiselect');

        // if select phase, clear cluster and set station selections
        phaseSelect.addEventListener('change', () => {
            const selectedPhases = Array.from(phaseSelect.selectedOptions).map(o => o.value);
            Array.from(clusterSelect.options).forEach(opt => opt.selected = false);
            Array.from(stationSelect.options).forEach(opt => {
                opt.selected = selectedPhases.includes(opt.dataset.phase);
            });
        });

        // if select cluster, clear phase and set station selections
        clusterSelect.addEventListener('change', () => {
            const selectedClusters = Array.from(clusterSelect.selectedOptions).map(o => o.value);
            Array.from(phaseSelect.options).forEach(opt => opt.selected = false);
            Array.from(stationSelect.options).forEach(opt => {
                opt.selected = selectedClusters.includes(opt.dataset.cluster);
            });
        });

        // if select station, clear phase and cluster selections
        stationSelect.addEventListener('change', () => {
            Array.from(phaseSelect.options).forEach(opt => opt.selected = false);
            Array.from(clusterSelect.options).forEach(opt => opt.selected = false);
        });
    }

    /**
     * Attaches a change listener to the "Edit entire series" checkbox.
     * When checked, updates the start and end date inputs to the series-level dates.
     * When unchecked, restores them to the individual event dates.
     * @param {Object} data - Event data containing start, end, originalStartDateTime, and originalEndDateTime
     */
    _setupEditSeriesListener(data) {
        const editSeriesCheckbox = document.querySelector('input[name="editAllInRecurrenceSeries"]');
        if (!editSeriesCheckbox) return;

        // if select edit Series, set start and end date to series start and end date
        editSeriesCheckbox.addEventListener('change', () => {
            const startInput = document.querySelector('input[name="start"]');
            const endInput = document.querySelector('input[name="end"]');
            if (editSeriesCheckbox.checked) {
                if (startInput) startInput.value = data.originalStartDateTime.toString("dd/MM/yyyy");
                if (endInput) endInput.value = data.originalEndDateTime.toString("dd/MM/yyyy");
            } else {
                if (startInput) startInput.value = data.start.toString("dd/MM/yyyy");
                if (endInput) endInput.value = data.end.toString("dd/MM/yyyy");
            }
        });
    }

    /**
     * Handles form close by extracting station selections and datetime values from the DOM
     * and writing them back to modal.result before the form is finalized.
     * Required because DayPilot does not natively capture custom HTML fields or
     * datetime values modified outside its own inputs.
     * @param {Object} modal - DayPilot modal instance with a result property
     */
    _handleFormClose(modal) {
        // ensures the selected stations are saved before closing form
        const selectEl = document.getElementById("station-multiselect");
        if (selectEl && modal.result) {
            modal.result.resource = Array.from(selectEl.selectedOptions)
                .map(opt => opt.value);
        }

        // ensure datetimes are saved, since they may change with the edit series checkbox
        if (modal.result) {
            const dateItems = document.querySelectorAll('.modal_default_form_item_datetime');
            const startDate = dateItems[0]?.querySelector('input.modal_default_input_date')?.value;
            const startTime = dateItems[0]?.querySelector('input[type="hidden"]')?.value;
            const endDate = dateItems[1]?.querySelector('input.modal_default_input_date')?.value;
            const endTime = dateItems[1]?.querySelector('input[type="hidden"]')?.value;

            modal.result.start = new DayPilot.Date.parse(`${startDate} ${startTime}`, "dd/MM/yyyy HH:mm");
            modal.result.end = new DayPilot.Date.parse(`${endDate} ${endTime}`, "dd/MM/yyyy HH:mm");
        }
    }
}
