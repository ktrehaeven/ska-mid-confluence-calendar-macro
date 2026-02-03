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

            const postedConfluenceEvent = await window.SkaLow.createNewConfluenceEvent(result)

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
            })

            window.SkaLow.updateVisibleResources()
            calendar.update();

        },

        onEventClick: async function (args) {

            const e = args.e.data;
            const siblings = calendar.events.list.filter(ev => (ev.parentId) === e.parentId);
            const currentResources = [...new Set(siblings.map(ev => String(ev.resource)).filter(Boolean))];

            const result = await window.SkaLow.showEventForm({
                text: e.text,
                type: e.eventType,
                // who: e.who || "",
                start: e.start,
                end: e.end,
                resource: currentResources || "",
                description: e.description || ""
            });

            if (!result) return;

            const selectedResources = Array.isArray(result.resource)
                ? result.resource.map(r => String(r))
                : [String(result.resource)];

            const nextResources = [...new Set(selectedResources)].filter(Boolean);

            // compute diff
            const toAdd = nextResources.filter(r => !currentResources.includes(r));
            const toRemove = currentResources.filter(r => !nextResources.includes(r));
            const toKeep = nextResources.filter(r => currentResources.includes(r));

            // update instances toKeep
            for (const r of toKeep) {
                const id = `${e.parentId}:${r}`;
                const ev = calendar.events.find(id);
                if (!ev) continue;

                Object.assign(ev.data,
                    {
                        text: result.text,
                        start: result.start.getTime(),
                        end: result.end.getTime(),
                        resource: r,
                        description: result.description
                    })

            }

            // delete instances toRemove
            for (const r of toRemove) {
                const id = `${e.parentId}:${r}`;
                const ev = calendar.events.find(id);
                if (ev) {
                    calendar.events.remove(ev);
                }
            }

            // create instances toAdd
            for (const r of toAdd) {
                const id = `${e.parentId}:${r}`;

                // Safety: avoid "already loaded" error if something unexpected exists
                if (calendar.events.find(id)) continue;

                const newDayPilotEvent = new DayPilot.Event({
                    id: id,
                    parentId: e.parentId,
                    text: result.text,
                    start: result.start.getTime(),
                    end: result.end.getTime(),
                    resource: r,
                    description: result.description
                });

                calendar.events.add(newDayPilotEvent);
            }

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
        onHeaderClick: (args) => {
            console.log("header clicked: " + args.e.text());
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