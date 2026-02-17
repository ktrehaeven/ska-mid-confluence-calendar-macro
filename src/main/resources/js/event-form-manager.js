class EventFormManager {
    constructor(eventService, stationDataManager, calendarRenderer) {
        this.eventService = eventService;
        this.stationDataManager = stationDataManager;
        this.calendarRenderer = calendarRenderer;
    }

    async show(data) {
        const preSelectedStations = Array.isArray(data.resource) ?
            data.resource : [data.resource].filter(Boolean);
        const eventForm = this._buildFormDefinition(preSelectedStations, data);
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

    _buildFormDefinition(preSelectedStations, data) {
        return [
            { name: "Title", id: "text", type: "text" },
            { name: "Creator", id: "creator", type: "text", disabled: true },
            {
                name: "Event Type",
                id: "customEventTypeId",
                options: this.eventService.customEventTypes.filter(type => type.name !== type.id),
                type: "select"
            },
            { name: "Start", id: "start", type: "datetime", timeInterval: 1 },
            { name: "End", id: "end", type: "datetime", timeInterval: 1 },
            this._buildStationSelect(preSelectedStations, data.start, data.end),
            { name: "Description", id: "description", type: "textarea", height: 70 }
        ];
    }

    /**
     * Checks if a station has a conflicting event in the given time range,
     * ignoring siblings of the event currently being edited.
     */
    _isStationBusy(stationLabel, start, end) {
        const events = this.calendarRenderer.calendar.events.list;
        const startTime = new DayPilot.Date(start).getTime();
        const endTime = new DayPilot.Date(end).getTime();

        return events.some(ev => {
            if (ev.resource !== stationLabel) return false;

            const evStart = new DayPilot.Date(ev.start).getTime();
            const evEnd = new DayPilot.Date(ev.end).getTime();

            // Overlap check: events overlap if one starts before the other ends
            return evStart < endTime && evEnd > startTime;
        });
    }

    _buildStationSelect(preSelectedStations, start, end) {
        const phaseFilters = ["AA1", "AA0.5", "AAVS3"];
        const stations = this.stationDataManager.getStationsByPhase(phaseFilters);

        const optionsHtml = stations
            .map(station => {
                const selected = preSelectedStations.includes(station.Label) ? 'selected' : '';
                const busy = start && end
                    ? this._isStationBusy(station.Label, start, end)
                    : false;

                const dot = busy ? '🔴' : '🟢';

                return `<option
                value="${station.Label}"
                ${selected}
            >${dot} ${station.Label}</option>`;
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

    _handleFormClose(modal) {
        const selectEl = document.getElementById("station-multiselect");
        if (selectEl && modal.result) {
            modal.result.resource = Array.from(selectEl.selectedOptions)
                .map(opt => opt.value);
        }
    }
}