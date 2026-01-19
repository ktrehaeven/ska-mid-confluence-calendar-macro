AJS.toInit(function () {
    // For each macro instance on the page

    document.querySelectorAll('.ska-low-map-macro').forEach(initMap);

    document.querySelectorAll('.ska-low-station-bookings-macro').forEach(initBookings);

});

function initMap(wrapper) {
    const mapEl = wrapper.querySelector('.map');
    if (!mapEl || mapEl.dataset.initialised) return;
    mapEl.dataset.initialised = "true";

    // Initialize Leaflet map
    const map = L.map(mapEl).setView([-26.824722084, 116.76444824], 10);

    L.control.scale().addTo(map);

    // Add OpenStreetMap tiles
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        minZoom: 2,
        maxZoom: 17,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        ext: 'jpg',
    }).addTo(map);

    // Load station JSON and plot markers
    fetch(AJS.contextPath() + '/download/resources/com.skao.confluence.plugins.ska-low-confluence-calendar-macro:'
        + 'ska-low-confluence-calendar-macro-resources/stationLocations.json')
        .then(response => {
            if (!response.ok) {
                throw new Error("Failed to load stationLocations.json");
            }
            return response.json();
        })
        .then(stations => {
            stations.forEach(station => {
                L.circleMarker(
                    [station.Latitude, station.Longitude],
                    {
                        radius: 8,
                        color: '#1a73e8',
                        fillColor: '#1a73e8',
                        fillOpacity: 0.9
                    }
                )
                    .addTo(map)
                    .bindTooltip(
                        station.Label,
                        {
                            permanent: true,
                            direction: "right",
                            offset: [10, 0],
                            opacity: 0.8
                        }
                    );
            });
        })
        .catch(err => {
            console.error("Station map error:", err);
        });
};

async function initBookings(wrapper) {
    const calendarEl = wrapper.querySelector('.daypilot');
    if (!calendarEl || calendarEl.dataset.initialised) return;

    calendarEl.dataset.initialised = "true";

    const calendar = new DayPilot.Scheduler(calendarEl, {
        timeHeaders: [
            {
                groupBy: "Day",
            },
            {
                groupBy: "Hour",
            },
        ],
        scale: "Hour",
        days: DayPilot.Date.today().daysInMonth(),
        businessBeginsHour: 9,
        businessEndsHour: 17,
        startDate: DayPilot.Date.today().firstDayOfMonth(),
        timeRangeSelectedHandling: "Enabled",
        resources: [
            { name: "s8-1", id: "s8-1" },
            { name: "s9-2", id: "s9-2" },
            { name: "s8-6", id: "s8-6" },
            { name: "s10-3", id: "s10-3" }
        ],
        onTimeRangeSelected: async (args) => {
            const scheduler = args.control;
            const modal = await DayPilot.Modal.prompt("Create a new event:", "Event 1");
            scheduler.clearSelection();
            if (modal.canceled) { return; }
            scheduler.events.add({
                start: args.start,
                end: args.end,
                id: DayPilot.guid(),
                resource: args.resource,
                text: modal.result
            });
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
    });

    calendar.init();
    calendar.events.list = await get_cal_events();
    calendar.update();
}

async function get_cal_events() {
    const STATION_IDS = ["s8-1", "s9-2", "s8-6", "s10-3"];
    const response = await fetch(
        AJS.contextPath() +
        '/rest/calendar-services/1.0/calendar/events.json' +
        '?subCalendarId=1d075e7d-8bde-4cdc-bb0b-b59a6f4d2847' +
        '&start=2026-01-01T00:00:00Z' +
        '&end=2026-02-01T00:00:00Z'
    );

    if (!response.ok) {
        throw new Error('Failed to fetch calendar events');
    }

    const data = await response.json();

    return data.events.map(e => ({
        id: e.id,
        text: e.title,
        start: e.start,
        end: e.end,
        resource: "s8-1" // later: map this properly
    }));
}
