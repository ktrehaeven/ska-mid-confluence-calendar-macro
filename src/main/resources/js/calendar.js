window.SkaLow = window.SkaLow || {};



async function createEvent(body) {
    const url = AJS.contextPath() + "/rest/calendar-services/1.0/calendar/events.json";

    // Convert object to URL-encoded form data
    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && value !== null) {
            formData.append(key, value);
        }
    }

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest"
        },
        body: formData.toString()
    });

    if (!response.ok) {
        throw new Error(`Failed to create event: ${response.status} ${response.statusText}`);
    }

    return await response.json();
}



window.SkaLow.initCalendar = async function (wrapper) {
    // function for initialising and displaying daypilot scheduler 
    // async awaits the confluence events

    const calendarEl = wrapper.querySelector('.daypilot');
    const navEl = wrapper.querySelector('.daypilot-nav');
    const map = window.SkaLow.map;
    let selectedResourceId = null;

    if (!calendarEl || calendarEl.dataset.initialised) return;
    calendarEl.dataset.initialised = "true";

    window.SkaLow.calendar = new DayPilot.Scheduler(calendarEl, {
        timeHeaders: [
            { groupBy: "Day", },
            { groupBy: "Hour", },
        ],
        scale: "CellDuration",
        locale: "en-AU",
        cellDuration: 15,
        cellWidth: 20,
        days: 1,
        width: "100%",
        businessBeginsHour: 9,
        businessEndsHour: 17,
        dynamicEventRendering: "Disabled",
        startDate: DayPilot.Date.today(),
        timeRangeSelectedHandling: "Enabled",
        onTimeRangeSelected: async function (args) {

            const result = await showEventForm({
                text: "",
                start: args.start,
                // who: args.who,
                end: args.end,
                station: args.resource,
                description: ""
            });

            calendar.clearSelection();
            if (!result) return;

            const newEvent = {
                id: DayPilot.guid(),
                text: result.text,
                // who: result.who,
                start: result.start,
                end: result.end,
                resource: result.station,
                description: result.description
            };

            calendar.events.add(newEvent);
            const testEvent = {
                subCalendarId: "049f32ea-10db-463c-b2db-ab58dd91c316",
                what: "Test Event",
                startDate: "2026-01-28",
                endDate: "2026-01-28",
                startTime: "10:00",
                endTime: "11:00",
                allDayEvent: "false",
                editAllInRecurrenceSeries: "true",
                rruleStr: "",
                eventType: "other",
                confirmRemoveInvalidUsers: "false",
                userTimeZoneId: "Australia/Sydney"
            };

            createEvent(testEvent)
                .then(event => console.log("Created event:", event))
                .catch(err => console.error(err));
        },

        onEventClick: async function (args) {

            const e = args.e;

            const result = await showEventForm({
                text: e.text(),
                // who: e.data.who || "",
                start: e.start(),
                end: e.end(),
                station: e.data.resource || "",
                description: e.data.description || ""
            });

            if (!result) return;

            Object.assign(e.data,
                {
                    text: result.text,
                    // who: result.who,
                    start: result.start,
                    end: result.end,
                    resource: result.station,
                    description: result.description
                });
            calendar.events.update(e);
            window.SkaLow.saveCalendarToConfluence(calendar.events.list)
        },
        eventMoveHandling: "Update",
        onEventMoved: (args) => {
            console.log("Event moved: " + args.e.text());
        },
        eventResizeHandling: "Update",
        onEventResized: (args) => {
            console.log("Event resized: " + args.e.text());
        },
        eventDeleteHandling: "Update",
        onEventDeleted: (args) => {
            console.log("Event deleted: " + args.e.text());
        },
        onRowClick: (args) => {
            //clicking new row: zoom and tooltip station
            if (args.row.id != selectedResourceId) {
                if (map) {
                    const station = window.SkaLow.stationData[args.row.id];
                    map.flyTo(
                        [station.Latitude, station.Longitude], 13,
                        { animate: true, duration: 0.5 }
                    );

                    window.SkaLow.resetTooltips(map)
                    station.marker.openTooltip();
                }
                selectedResourceId = args.row.id;
                calendar.update();
            }
            //clicking same row: reset view
            else {
                if (map) {
                    window.SkaLow.resetView(map)
                    window.SkaLow.resetTooltips(map)
                }
                selectedResourceId = null
                calendar.update();
            }
        },
        onBeforeRowHeaderRender: (args) => {
            if (args.row.id === selectedResourceId) {
                args.row.backColor = "#e0e0e0";
            }
            else {
                args.row.backColor = null;
            }
        },
    });
    const calendar = window.SkaLow.calendar
    calendar.init();

    const nav = new DayPilot.Navigator(navEl, {
        selectMode: "Day",
        showMonths: 2,
        skipMonths: 1,
        freeHandSelectionEnabled: true,
        onTimeRangeSelected: args => {
            calendar.startDate = args.start;
            calendar.days = args.days;
            window.SkaLow.updateVisibleResources();
            calendar.update();
        }
    });
    nav.init()

    calendar.events.list = await window.SkaLow.getCalEvents();
    window.SkaLow.updateVisibleResources()
    calendar.update();
}

const eventForm = [
    { name: "Title", id: "text", type: "text" },
    // { name: "Who", id: "who", type: "text" },
    { name: "Start", id: "start", type: "datetime", timeInterval: 5 },
    { name: "End", id: "end", type: "datetime", timeInterval: 5 },
    { name: "Station", id: "station", type: "text" },
    { name: "Description", id: "description", type: "textarea" }
];

async function showEventForm(data) {
    const modal = await DayPilot.Modal.form(eventForm, data, {
        width: 450,
        height: 420,
        scrollWithPage: false
    });

    if (modal.canceled) return null;
    return modal.result;
}