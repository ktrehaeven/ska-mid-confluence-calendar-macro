class EventFormManager {
    constructor(eventService, stationDataManager) {
        this.eventService = eventService;
        this.stationDataManager = stationDataManager;
    }

    /**
     * Opens the event form modal prepopulated with the given event data.
     * Sets up station, series, and recurrence listeners after the DOM renders via setTimeout.
     * @param {Object} data - Event data to prepopulate the form with
     * @param {Array} eventsList - All calendar events, used to determine station availability
     * @returns {Promise<Object|null>} The submitted form result, or null if the modal was canceled
     */
    async show(data, eventsList = []) {
        const eventForm = this._buildFormDefinition(data, eventsList);

        setTimeout(() => {
            this._setupStationListeners();
            this._setupEditSeriesListener(data);
            this._setupRecurrenceListeners();
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
     * station selection, recurrence, and description.
     * @param {Object} data - Event data used to prepopulate and configure fields
     * @param {Array} eventsList - All calendar events, passed through to the station select for availability indicators
     * @returns {Array} Array of DayPilot form field definition objects
     */
    _buildFormDefinition(data, eventsList = []) {
        return [
            {
                name: "Event Type",
                id: "customEventTypeId",
                options: this.eventService.customEventTypes.filter(type => type.name !== type.id),
                type: "select"
            },
            { name: "Title (required)", id: "text", type: "text" },
            { name: "Creator", id: "creator", type: "text", disabled: true },
            { name: "Start", id: "start", type: "datetime", timeInterval: 1, dateFormat: "dd/MM/yyyy" },
            { name: "End", id: "end", type: "datetime", timeInterval: 1, dateFormat: "dd/MM/yyyy" },
            this._buildRecurrenceField(data),
            this._buildStationSelect(data, eventsList),
            { name: "Description", id: "description", type: "textarea", height: 70 }
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RECURRENCE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Builds the recurrence HTML form field.
     * Pre-selects values from data.rruleStr if present.
     * @param {Object} data - Event data, expects optional rruleStr property
     * @returns {Object} DayPilot form field definition with type "html"
     */
    _buildRecurrenceField(data) {
        const parsed = this._parseRrule(data.rruleStr || '');
        const isRecurring = this.eventService.isRecurring(data);

        const freqOptions = [
            { value: '', label: "Doesn't repeat" },
            { value: 'DAILY', label: 'Daily' },
            { value: 'WEEKLY', label: 'Weekly' },
            { value: 'MONTHLY', label: 'Monthly' },
            { value: 'YEARLY', label: 'Yearly' },
        ];

        const days = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
        const dayLabels = { MO: 'Mo', TU: 'Tu', WE: 'We', TH: 'Th', FR: 'Fr', SA: 'Sa', SU: 'Su' };
        const activeDays = parsed.BYDAY ? parsed.BYDAY.split(',') : [];

        const freqOptionsHtml = freqOptions.map(o =>
            `<option value="${o.value}" ${parsed.FREQ === o.value ? 'selected' : ''}>${o.label}</option>`
        ).join('');

        const dayBtnsHtml = days.map(d =>
            `<button type="button" class="rfm-day-btn ${activeDays.includes(d) ? 'rfm-day-active' : ''}" data-day="${d}">${dayLabels[d]}</button>`
        ).join('');

        const interval = parsed.INTERVAL || 1;

        // data.until (YYYYMMDD) is the canonical source; fall back to UNTIL inside rruleStr for legacy data
        const untilSource = data.until || parsed.UNTIL || '';

        const endNeverChecked = (!parsed.COUNT && !untilSource) ? 'checked' : '';
        const endTimesChecked = parsed.COUNT ? 'checked' : '';
        const endUntilChecked = untilSource ? 'checked' : '';
        const countVal = parsed.COUNT || 1;
        const untilVal = untilSource ? this._rruleDateToInput(untilSource) : '';

        const showRecurrence = parsed.FREQ ? '' : 'display:none;';

        const html = `
        <style>
            .rfm-section { margin-top: 2px; }
            .rfm-label { font-size:13px; font-weight:600; color:#344563; margin-bottom:4px; }
            .rfm-select, .rfm-input {
                width:100%; padding:6px 8px; border:1px solid #c1c7d0; border-radius:3px;
                font-size:13px; box-sizing:border-box; background:#fff; color:#172b4d;
            }
            .rfm-select:focus, .rfm-input:focus {
                outline:none; border-color:#4c9aff; box-shadow:0 0 0 2px rgba(76,154,255,.3);
            }
            .rfm-day-row { display:flex; gap:5px; flex-wrap:wrap; margin-top:2px; }
            .rfm-day-btn {
                width:32px; height:32px; border-radius:50%; border:1px solid #c1c7d0;
                background:#fff; font-size:11px; font-weight:600; cursor:pointer; color:#344563;
                transition:all .15s;
            }
            .rfm-day-btn.rfm-day-active { background:#0052cc; border-color:#0052cc; color:#fff; }
            .rfm-day-btn:hover:not(.rfm-day-active) { background:#e9efff; border-color:#4c9aff; }
            .rfm-interval-row { display:flex; align-items:center; gap:8px; }
            .rfm-interval-row .rfm-input { width:60px; text-align:center; }
            .rfm-interval-lbl { font-size:13px; color:#5e6c84; }
            .rfm-radio-opt { display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:13px; color:#172b4d; }
            .rfm-radio-opt input[type=radio] { margin:0; cursor:pointer; }
            .rfm-radio-opt .rfm-input { width:70px; text-align:center; }
            .rfm-radio-opt .rfm-input[type=date] { width:130px; text-align:left; }
            .rfm-radio-opt .rfm-input:disabled { background:#f4f5f7; color:#a5adba; cursor:not-allowed; }
            .rfm-date-picker-container { display:flex; align-items:center; gap:8px; }
            .rfm-date-picker-btn {
                padding:6px 8px; border:1px solid #c1c7d0; border-radius:3px;
                font-size:13px; background:#fff; color:#172b4d; cursor:pointer;
                transition:all .15s; min-width:80px;
            }
            .rfm-date-picker-btn:hover { background:#e9efff; border-color:#4c9aff; }
            .rfm-date-picker-btn:disabled { background:#f4f5f7; color:#a5adba; cursor:not-allowed; }
            .rfm-error { color:#de350b; font-size:11px; margin-top:3px; display:none; }
            ${isRecurring ? `
            .rfm-instance-check {
                display:flex; align-items:center; gap:8px; 
                margin-bottom:10px; font-size:13px;
            }
            .rfm-instance-check input { margin:0; cursor:pointer; }
            .rfm-instance-check label { margin:0; font-weight:500; cursor:pointer; }
            ` : ''}
        </style>

        <div class="rfm-section">

            ${isRecurring ? `
            <div class="rfm-instance-check">
                <input type="checkbox" id="rfm-edit-instance" checked>
                <label for="rfm-edit-instance">Edit this instance only</label>
            </div>` : ''}

            <div class="rfm-label">Repeat</div>
            <select class="rfm-select" id="rfm-freq">
                ${freqOptionsHtml}
            </select>

            <div id="rfm-recurrence-body">
            <!-- Weekly: repeat on days -->
            <div id="rfm-repeat-on" style="${parsed.FREQ === 'WEEKLY' ? '' : 'display:none;'} margin-top:10px;">
                <div class="rfm-label">Repeat on</div>
                <div class="rfm-day-row">${dayBtnsHtml}</div>
            </div>

            <!-- Monthly: by date or weekday -->
            <div id="rfm-monthly-opts" style="${parsed.FREQ === 'MONTHLY' ? '' : 'display:none;'} margin-top:10px;">
                <div class="rfm-label">Repeat on</div>
                <div class="rfm-radio-opt">
                    <input type="radio" name="rfm-monthly-type" id="rfm-monthly-day" value="day" checked>
                    <label for="rfm-monthly-day" id="rfm-monthly-day-lbl">Day 1</label>
                </div>
                <div class="rfm-radio-opt">
                    <input type="radio" name="rfm-monthly-type" id="rfm-monthly-weekday" value="weekday">
                    <label for="rfm-monthly-weekday" id="rfm-monthly-weekday-lbl">First Monday</label>
                </div>
            </div>

            <!-- Interval -->
            <div id="rfm-interval" style="${showRecurrence} margin-top:10px;">
                <div class="rfm-label">Repeat every</div>
                <div class="rfm-interval-row">
                    <input type="number" class="rfm-input" id="rfm-interval-val" value="${interval}" min="1" max="99">
                    <span class="rfm-interval-lbl" id="rfm-interval-lbl"></span>
                </div>
                <div class="rfm-error" id="rfm-interval-error">Please enter a number between 1 and 99.</div>
            </div>

            <!-- End repeat -->
            <div id="rfm-end-repeat" style="${showRecurrence} margin-top:10px;">
                <div class="rfm-label">End repeat</div>

                <div class="rfm-radio-opt">
                    <input type="radio" name="rfm-end" id="rfm-end-never" value="never" ${endNeverChecked}>
                    <label for="rfm-end-never">Never</label>
                </div>
                <div class="rfm-radio-opt">
                    <input type="radio" name="rfm-end" id="rfm-end-times" value="times" ${endTimesChecked}>
                    <label for="rfm-end-times">After</label>
                    <input type="number" class="rfm-input" id="rfm-end-times-val"
                           value="${countVal}" min="1" max="999" ${endTimesChecked ? '' : 'disabled'}>
                    <span class="rfm-interval-lbl">occurrences</span>
                </div>
                <div class="rfm-radio-opt">
                    <input type="radio" name="rfm-end" id="rfm-end-until" value="until" ${endUntilChecked}>
                    <label for="rfm-end-until">On date</label>
                    <div class="rfm-date-picker-container">
                        <button type="button" class="rfm-date-picker-btn" id="rfm-end-until-picker-btn"
                                ${endUntilChecked ? '' : 'disabled'}>${untilVal || 'Pick date'}</button>
                    </div>
                    <input type="hidden" id="rfm-end-until-val" value="${untilVal}">
                </div>
                <div class="rfm-error" id="rfm-until-error">Please select a valid end date.</div>
            </div>

            </div> <!-- /rfm-recurrence-body -->

            <input type="hidden" id="rfm-rrule-out" value="${data.rruleStr || ''}">
        </div>`;

        return {
            name: "Recurrence",
            id: "rruleStr",
            type: "html",
            html
        };
    }

    /**
     * Updates the monthly recurrence labels ("Day X" / "First Monday") by reading
     * the current value of the start date input in the form rather than using a
     * fixed date from data. This means it stays correct after the "Edit this instance
     * only" checkbox swaps the dates to the series start.
     */
    _updateMonthlyLabels() {
        const startInput = document.querySelector('input[name="start"]');
        if (!startInput?.value) return;

        const d = DayPilot.Date.parse(startInput.value, "dd/MM/yyyy");
        if (!d) return;

        const dayNum = d.toString('d');
        const weekdayName = d.toString('dddd');
        const weekOfMonth = this._weekOfMonth(d);

        const dayLbl = document.getElementById('rfm-monthly-day-lbl');
        const weekdayLbl = document.getElementById('rfm-monthly-weekday-lbl');
        if (dayLbl) dayLbl.textContent = `Day ${dayNum}`;
        if (weekdayLbl) weekdayLbl.textContent = `${this._ordinal(weekOfMonth)} ${weekdayName}`;
    }

    /**
     * Wires up all interactivity for the recurrence section.
     * Must be called after the modal DOM has rendered (i.e. inside setTimeout).
     */
    _setupRecurrenceListeners() {
        const freqEl = document.getElementById('rfm-freq');
        const repeatOnEl = document.getElementById('rfm-repeat-on');
        const monthlyEl = document.getElementById('rfm-monthly-opts');
        const intervalEl = document.getElementById('rfm-interval');
        const endRepeatEl = document.getElementById('rfm-end-repeat');
        const intervalLbl = document.getElementById('rfm-interval-lbl');
        const intervalVal = document.getElementById('rfm-interval-val');
        const intervalErr = document.getElementById('rfm-interval-error');

        const endTimesRadio = document.getElementById('rfm-end-times');
        const endUntilRadio = document.getElementById('rfm-end-until');
        const endTimesVal = document.getElementById('rfm-end-times-val');
        const endUntilVal = document.getElementById('rfm-end-until-val');
        const endUntilPickerBtn = document.getElementById('rfm-end-until-picker-btn');

        const INTERVAL_LABELS = { DAILY: 'days', WEEKLY: 'weeks', MONTHLY: 'months', YEARLY: 'years' };

        // Populate monthly labels from whatever start date is currently in the form
        this._updateMonthlyLabels();

        const updateVisibility = () => {
            const freq = freqEl.value;
            const show = freq !== '';

            repeatOnEl.style.display = freq === 'WEEKLY' ? '' : 'none';
            monthlyEl.style.display = freq === 'MONTHLY' ? '' : 'none';
            intervalEl.style.display = show ? '' : 'none';
            endRepeatEl.style.display = show ? '' : 'none';

            if (show) intervalLbl.textContent = INTERVAL_LABELS[freq] || '';
        };

        freqEl.addEventListener('change', updateVisibility);
        updateVisibility(); // run once in case of pre-populated freq

        // Day toggle buttons
        document.querySelectorAll('.rfm-day-btn').forEach(btn => {
            btn.addEventListener('click', () => btn.classList.toggle('rfm-day-active'));
        });

        // Enable/disable end-repeat sub-inputs
        const syncEndInputs = () => {
            endTimesVal.disabled = !endTimesRadio.checked;
            endUntilVal.disabled = !endUntilRadio.checked;
            endUntilPickerBtn.disabled = !endUntilRadio.checked;
        };

        document.querySelectorAll('input[name="rfm-end"]').forEach(r =>
            r.addEventListener('change', syncEndInputs)
        );

        // Interval validation
        intervalVal.addEventListener('input', () => {
            const v = parseInt(intervalVal.value);
            intervalErr.style.display = (v > 0 && v < 100) ? 'none' : 'block';
        });

        // Inline date picker for "until" field
        if (endUntilPickerBtn) {
            endUntilPickerBtn.addEventListener('click', () => {

                const picker = new DayPilot.DatePicker({
                    target: endUntilPickerBtn,
                    pattern: 'dd/MM/yyyy',
                    zIndex: 1100,
                    onTimeRangeSelected: args => {
                        this._untilValue = args.date.toString("yyyyMMdd");
                        endUntilVal.value = args.date.toString("dd/MM/yyyy");;
                    }
                });

                picker.show();
            });
        }
    }

    /**
     * Builds an RRULE string from the current state of the recurrence form DOM.
     * Returns an empty string if "Doesn't repeat" is selected.
     * @returns {string} RRULE string, e.g. "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE"
     */
    _buildRruleFromForm() {
        const freqEl = document.getElementById('rfm-freq');
        if (!freqEl) return '';

        const freq = freqEl.value;
        if (!freq) return '';

        const parts = [`FREQ=${freq}`];

        const interval = parseInt(document.getElementById('rfm-interval-val')?.value || '1');
        if (interval > 1) parts.push(`INTERVAL=${interval}`);

        if (freq === 'WEEKLY') {
            const activeDays = [...document.querySelectorAll('.rfm-day-btn.rfm-day-active')]
                .map(b => b.dataset.day);
            if (activeDays.length) parts.push(`BYDAY=${activeDays.join(',')}`);
        }

        if (freq === 'MONTHLY') {
            const monthlyType = document.querySelector('input[name="rfm-monthly-type"]:checked')?.value;
            if (monthlyType === 'weekday') {
                const lbl = document.getElementById('rfm-monthly-weekday-lbl')?.textContent || '';
                // e.g. "First Monday" → BYDAY=+1MO
                const ordinalMap = { First: '+1', Second: '+2', Third: '+3', Fourth: '+4', Fifth: '+5' };
                const [ord, ...rest] = lbl.split(' ');
                const dayAbbr = this._weekdayToRrule(rest.join(' '));
                if (ordinalMap[ord] && dayAbbr) parts.push(`BYDAY=${ordinalMap[ord]}${dayAbbr}`);
            }
            // else BYMONTHDAY is implied by DTSTART
        }

        const endType = document.querySelector('input[name="rfm-end"]:checked')?.value;
        if (endType === 'times') {
            const count = parseInt(document.getElementById('rfm-end-times-val')?.value || '1');
            if (count > 0) parts.push(`COUNT=${count}`);
        }

        return parts.join(';');
    }

    /**
     * Parses a RRULE string into a plain key/value object.
     * @param {string} rruleStr - e.g. "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5"
     * @returns {Object} e.g. { FREQ: 'WEEKLY', BYDAY: 'MO,WE', COUNT: '5' }
     */
    _parseRrule(rruleStr) {
        if (!rruleStr) return {};
        const rule = rruleStr.replace(/^RRULE:/i, '');
        return Object.fromEntries(
            rule.split(';').map(part => part.split('='))
        );
    }

    /**
     * Converts an RRULE UNTIL date string (e.g. "20260301T000000Z") to YYYYMMDD format.
     * @param {string} rruleDate
     * @returns {string}
     */
    _rruleDateToInput(rruleDate) {
        const d = rruleDate.replace(/T.*$/, ''); // e.g. "20260301"
        return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`; // "01/03/2026"
    }

    /**
     * Returns the ordinal word for a number (1 → "First", 2 → "Second", etc.)
     * @param {number} n
     * @returns {string}
     */
    _ordinal(n) {
        return ['First', 'Second', 'Third', 'Fourth', 'Fifth'][n - 1] || `${n}th`;
    }

    /**
     * Returns which week-of-month (1–5) a DayPilot.Date falls on.
     * @param {DayPilot.Date} date
     * @returns {number}
     */
    _weekOfMonth(date) {
        return Math.ceil(parseInt(date.toString('d')) / 7);
    }

    /**
     * Converts a full weekday name to its two-letter RRULE abbreviation.
     * @param {string} name - e.g. "Monday"
     * @returns {string} e.g. "MO"
     */
    _weekdayToRrule(name) {
        return {
            Monday: 'MO', Tuesday: 'TU', Wednesday: 'WE', Thursday: 'TH',
            Friday: 'FR', Saturday: 'SA', Sunday: 'SU'
        }[name] || '';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STATIONS (unchanged)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Checks if a station has a conflicting event in the given time range.
     */
    _isStationBusy(stationLabel, start, end, eventsList = []) {
        const startTime = new DayPilot.Date(start).getTime();
        const endTime = new DayPilot.Date(end).getTime();

        return eventsList.some(ev => {
            if (ev.resource !== stationLabel) return false;
            const evStart = new DayPilot.Date(ev.start).getTime();
            const evEnd = new DayPilot.Date(ev.end).getTime();
            return evStart < endTime && evEnd > startTime;
        });
    }

    /**
     * Builds the station selection HTML form field.
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
        </div>`;

        return { name: "Stations", id: "text", type: "html", html };
    }

    /**
     * Attaches change listeners to the phase, cluster, and station multiselects.
     */
    _setupStationListeners() {
        const phaseSelect = document.getElementById('phase-multiselect');
        const clusterSelect = document.getElementById('cluster-multiselect');
        const stationSelect = document.getElementById('station-multiselect');

        phaseSelect.addEventListener('change', () => {
            const selectedPhases = Array.from(phaseSelect.selectedOptions).map(o => o.value);
            Array.from(clusterSelect.options).forEach(opt => opt.selected = false);
            Array.from(stationSelect.options).forEach(opt => {
                opt.selected = selectedPhases.includes(opt.dataset.phase);
            });
        });

        clusterSelect.addEventListener('change', () => {
            const selectedClusters = Array.from(clusterSelect.selectedOptions).map(o => o.value);
            Array.from(phaseSelect.options).forEach(opt => opt.selected = false);
            Array.from(stationSelect.options).forEach(opt => {
                opt.selected = selectedClusters.includes(opt.dataset.cluster);
            });
        });

        stationSelect.addEventListener('change', () => {
            Array.from(phaseSelect.options).forEach(opt => opt.selected = false);
            Array.from(clusterSelect.options).forEach(opt => opt.selected = false);
        });
    }

    /**
     * Enables or disables all recurrence controls below the "Edit this instance only" checkbox.
     * When disabled, the freq select, day buttons, interval input, and end-repeat inputs are all
     * greyed out and non-interactive. Called on init and on every checkbox change.
     * @param {boolean} disabled
     */
    _setRecurrenceFieldsDisabled(disabled) {
        const freqEl = document.getElementById('rfm-freq');
        const intervalVal = document.getElementById('rfm-interval-val');
        const endTimesRadio = document.getElementById('rfm-end-times');
        const endUntilRadio = document.getElementById('rfm-end-until');
        const endNeverRadio = document.getElementById('rfm-end-never');
        const endTimesVal = document.getElementById('rfm-end-times-val');
        const endUntilPickerBtn = document.getElementById('rfm-end-until-picker-btn');

        if (freqEl) freqEl.disabled = disabled;
        if (intervalVal) intervalVal.disabled = disabled;
        if (endNeverRadio) endNeverRadio.disabled = disabled;
        if (endTimesRadio) endTimesRadio.disabled = disabled;
        if (endUntilRadio) endUntilRadio.disabled = disabled;

        // Only disable the sub-inputs if the section itself is being disabled;
        // when re-enabling, restore them based on the current radio state instead.
        if (disabled) {
            if (endTimesVal) endTimesVal.disabled = true;
            if (endUntilPickerBtn) endUntilPickerBtn.disabled = true;
        } else {
            if (endTimesVal) endTimesVal.disabled = !endTimesRadio?.checked;
            if (endUntilPickerBtn) endUntilPickerBtn.disabled = !endUntilRadio?.checked;
        }

        document.querySelectorAll('.rfm-day-btn').forEach(btn => {
            btn.style.pointerEvents = disabled ? 'none' : '';
            btn.style.opacity = disabled ? '0.4' : '';
        });

        // Dim the labels/sections visually
        const recurrenceBody = document.getElementById('rfm-recurrence-body');
        if (recurrenceBody) recurrenceBody.style.opacity = disabled ? '0.5' : '1';
    }

    /**
     * Attaches a change listener to the "Edit this instance only" checkbox in the recurrence field.
     * Disables all recurrence fields when checked (instance edit), enables them when unchecked (series edit).
     * Also swaps the start/end date inputs accordingly and writes editAllInRecurrenceSeries to the result.
     * @param {Object} data - Event data containing start, end, originalStartDateTime, originalEndDateTime
     */
    _setupEditSeriesListener(data) {
        const editInstanceCheckbox = document.getElementById('rfm-edit-instance');
        if (!editInstanceCheckbox) return;

        // Track checkbox state so _handleFormClose can read it even if DOM is gone
        this._editInstanceChecked = editInstanceCheckbox.checked; // true = instance only

        this._setRecurrenceFieldsDisabled(editInstanceCheckbox.checked);

        editInstanceCheckbox.addEventListener('change', () => {
            this._editInstanceChecked = editInstanceCheckbox.checked;
            const editingSeries = !editInstanceCheckbox.checked;
            this._setRecurrenceFieldsDisabled(!editingSeries);

            const startInput = document.querySelector('input[name="start"]');
            const endInput = document.querySelector('input[name="end"]');
            if (editingSeries) {
                if (startInput) startInput.value = data.originalStartDateTime.toString("dd/MM/yyyy");
                if (endInput) endInput.value = data.originalEndDateTime.toString("dd/MM/yyyy");
            } else {
                if (startInput) startInput.value = data.start.toString("dd/MM/yyyy");
                if (endInput) endInput.value = data.end.toString("dd/MM/yyyy");
            }

            // Re-derive monthly labels from whichever start date is now in the form
            this._updateMonthlyLabels();
        });
    }

    /**
     * Handles form close: extracts station selections, datetime values, and the
     * built RRULE string from the DOM and writes them back to modal.result.
     */
    _handleFormClose(modal) {
        // Capture station selections
        const selectEl = document.getElementById("station-multiselect");
        if (selectEl && modal.result) {
            modal.result.resource = Array.from(selectEl.selectedOptions).map(opt => opt.value);
        }

        // Capture modified datetimes
        if (modal.result) {
            const dateItems = document.querySelectorAll('.modal_default_form_item_datetime');
            const startDate = dateItems[0]?.querySelector('input.modal_default_input_date')?.value;
            const startTime = dateItems[0]?.querySelector('input[type="hidden"]')?.value;
            const endDate = dateItems[1]?.querySelector('input.modal_default_input_date')?.value;
            const endTime = dateItems[1]?.querySelector('input[type="hidden"]')?.value;

            modal.result.start = new DayPilot.Date.parse(`${startDate} ${startTime}`, "dd/MM/yyyy HH:mm");
            modal.result.end = new DayPilot.Date.parse(`${endDate} ${endTime}`, "dd/MM/yyyy HH:mm");

            // Capture the built RRULE and until (returned separately, not inside the RRULE)
            modal.result.rruleStr = this._buildRruleFromForm();
            modal.result.until = document.getElementById('rfm-end-until')?.checked ? (this._untilValue || null) : null;

            // editAllInRecurrenceSeries is the inverse of "Edit this instance only"
            if (document.getElementById('rfm-edit-instance')) {
                // Checkbox existed — use tracked state (safer than re-querying DOM)
                modal.result.editAllInRecurrenceSeries = !this._editInstanceChecked;
            } else {
                // New event — no checkbox, derive from whether a recurrence was set
                modal.result.editAllInRecurrenceSeries = !!modal.result.rruleStr;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DELETE CONFIRMATION (unchanged)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Opens the delete confirmation modal.
     */
    async confirmDelete(event) {
        const name = event.text || "Untitled booking";
        const start = new DayPilot.Date(event.start).toString("dd/MM/yyyy HH:mm");
        const end = new DayPilot.Date(event.end).toString("dd/MM/yyyy HH:mm");

        const htmlField = {
            name: "Heading", id: "heading", type: "html",
            html: `
            <div style="text-align:left; line-height:1.6;">
                <div style="font-size:16px; font-weight:600;">Delete booking?</div>
                <br>
                <div><strong>${name}</strong><br>${start} - ${end}</div>
                <br>
                <div>This action cannot be undone.</div>
            </div>`
        };

        const scopeField = {
            name: "", id: "deleteScope", type: "radio",
            options: [
                { name: "This instance only", id: "single" },
                { name: "This and all future instances", id: "future" },
                { name: "Entire series", id: "series" }
            ]
        };

        const deleteForm = this.eventService.isRecurring(event)
            ? [htmlField, scopeField]
            : [htmlField];

        const modal = await DayPilot.Modal.form(deleteForm, { deleteScope: "single" }, {
            okText: "Delete",
            cancelText: "Cancel",
            scrollWithPage: false,
            zIndex: 1000,
        });

        if (modal.canceled) return null;
        return modal.result;
    }
}