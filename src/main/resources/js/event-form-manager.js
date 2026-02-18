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
            { name: "Title (required)", id: "text", type: "text" },
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
            const selected = preSelectedStations.includes(station.Label) ? 'selected' : '';
            const busy = start && end ? this._isStationBusy(station.Label, start, end) : false;
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

        setTimeout(() => {
            const phaseSelect = document.getElementById('phase-multiselect');
            const clusterSelect = document.getElementById('cluster-multiselect');
            const stationSelect = document.getElementById('station-multiselect');
            if (!phaseSelect || !clusterSelect || !stationSelect) return;

            phaseSelect.addEventListener('change', () => {
                const selectedPhases = Array.from(phaseSelect.selectedOptions).map(o => o.value);
                // Clear cluster selection when phase is used
                Array.from(clusterSelect.options).forEach(opt => opt.selected = false);
                Array.from(stationSelect.options).forEach(opt => {
                    opt.selected = selectedPhases.includes(opt.dataset.phase);
                });
            });

            clusterSelect.addEventListener('change', () => {
                const selectedClusters = Array.from(clusterSelect.selectedOptions).map(o => o.value);
                // Clear phase selection when cluster is used
                Array.from(phaseSelect.options).forEach(opt => opt.selected = false);
                Array.from(stationSelect.options).forEach(opt => {
                    opt.selected = selectedClusters.includes(opt.dataset.cluster);
                });
            });

            stationSelect.addEventListener('change', () => {
                const selectedStations = Array.from(stationSelect.selectedOptions).map(o => o.value);
                // Clear phase & cluster selection when station is used
                Array.from(phaseSelect.options).forEach(opt => opt.selected = false);
                Array.from(clusterSelect.options).forEach(opt => opt.selected = false);
            });
        }, 0);

        return {
            name: "Stations",
            id: "text",
            type: "html",
            html
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