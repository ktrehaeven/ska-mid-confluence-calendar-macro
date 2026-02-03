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

    const calendar = window.SkaLow.calendar = new DayPilot.Scheduler(calendarEl, {
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

            const newConfluenceEvent = {
                what: result.text,
                customEventTypeId: result.type,
                subCalendarId: window.SkaLow.skaConstructionCalId,
                startDate: window.SkaLow.convertToConfluenceDate(result.start.value),
                endDate: window.SkaLow.convertToConfluenceDate(result.end.value),
                startTime: window.SkaLow.convertToConfluenceTime(result.start.value),
                endTime: window.SkaLow.convertToConfluenceTime(result.end.value),
                description: result.description.includes(result.resource) ?
                    result.description : result.resource + "\n\n" + result.description,
                // invitees: [{ name: result.who }],
                // allDayEvent: "false",
                // editAllInRecurrenceSeries: "true",
                // rruleStr: "",
                // confirmRemoveInvalidUsers: "false",
                eventType: "custom",
                userTimeZoneId: "Australia/Perth",
            };

            let postedConfluenceEvent = await window.SkaLow.createEvent(newConfluenceEvent)
                .catch(err => { console.error(err); return null });

            if (!postedConfluenceEvent.success) return

            result.resource.forEach((r) => {

                const newDayPilotEvent = new DayPilot.Event({
                    id: `${postedConfluenceEvent.event.id}:${r}`,
                    parentId: postedConfluenceEvent.event.id,
                    text: result.text,
                    // who: result.who,
                    start: result.start.getTime(),
                    end: result.end.getTime(),
                    resource: r,
                    description: result.description
                });

                calendar.events.add(newDayPilotEvent);
                console.log(newDayPilotEvent)
            })

            window.SkaLow.updateVisibleResources()
            calendar.update();

        },

        onEventClick: async function (args) {

            const e = args.e;

            const result = await window.SkaLow.showEventForm({
                text: e.text(),
                type: e.data.eventType,
                // who: e.data.who || "",
                start: e.start(),
                end: e.end(),
                resource: e.data.resource || "",
                description: e.data.description || ""
            });

            if (!result) return;

            // TODO: handle if resource changes or if more resources are selected
            // or for editing should it by per resource? or multi select all resources? 
            Object.assign(e.data,
                {
                    text: result.text,
                    // who: result.who,
                    start: result.start.getTime(),
                    end: result.end.getTime(),
                    resource: result.resource,
                    description: result.description
                });

            calendar.events.update(e);
            window.SkaLow.updateVisibleResources()
            calendar.update();
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