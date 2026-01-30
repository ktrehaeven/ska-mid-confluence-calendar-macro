window.SkaLow = window.SkaLow || {};

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

            const result = await window.SkaLow.showEventForm({
                text: "",
                start: args.start,
                // who: "",
                end: args.end,
                resource: args.resource,
                description: ""
            });

            calendar.clearSelection();
            if (!result) return;

            const newDayPilotEvent = new DayPilot.Event({
                id: DayPilot.guid(),
                text: result.text,
                // who: result.who,
                start: result.start.getTime(),
                end: result.end.getTime(),
                resource: result.resource,
                description: result.description
            });

            calendar.events.add(newDayPilotEvent);
            window.SkaLow.updateVisibleResources()
            calendar.update();

            const newConfluenceEvent = {
                what: result.text,
                customEventTypeId: result.type,
                subCalendarId: window.SkaLow.skaConstructionCalId,
                startDate: window.SkaLow.convertToConfluenceDate(result.start.value),
                endDate: window.SkaLow.convertToConfluenceDate(result.end.value),
                startTime: window.SkaLow.convertToConfluenceTime(result.start.value),
                endTime: window.SkaLow.convertToConfluenceTime(result.end.value),
                // invitees: [{ name: result.who }],
                // allDayEvent: "false",
                // editAllInRecurrenceSeries: "true",
                // rruleStr: "",
                // confirmRemoveInvalidUsers: "false",
                eventType: "custom",
                userTimeZoneId: "Australia/Perth",
            };

            await window.SkaLow.createEvent(newConfluenceEvent)
                .then(event => console.log("Created event:", event))
                .catch(err => console.error(err));

        },

        onEventClick: async function (args) {

            const e = args.e;

            const result = await window.SkaLow.showEventForm({
                text: e.text(),
                // who: e.data.who || "",
                start: e.start(),
                end: e.end(),
                resource: e.data.resource || "",
                description: e.data.description || ""
            });

            if (!result) return;

            Object.assign(e.data,
                {
                    text: result.text,
                    // who: result.who,
                    start: result.start,
                    end: result.end,
                    resource: result.resource,
                    description: result.description
                });
            calendar.events.update(e);
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