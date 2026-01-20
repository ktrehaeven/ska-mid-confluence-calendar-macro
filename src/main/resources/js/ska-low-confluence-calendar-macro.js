AJS.toInit(function () {
    // initialise each macro instance on the page

    document.querySelectorAll('.ska-low-map-macro').forEach(initMap);

    document.querySelectorAll('.ska-low-station-bookings-macro').forEach(initCalendar);

});

function initMap(wrapper) {
    // function for initialising and displaying station map

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

async function initCalendar(wrapper) {
    // function for initialising and displaying daypilot scheduler 

    const calendarEl = wrapper.querySelector('.daypilot');
    const navEl = wrapper.querySelector('.daypilot-nav');

    if (!calendarEl || calendarEl.dataset.initialised) return;
    calendarEl.dataset.initialised = "true";

    const calendar = new DayPilot.Scheduler(calendarEl, {
        timeHeaders: [
            { groupBy: "Day", },
            { groupBy: "Hour", },
        ],
        scale: "Hour",
        days: 7,
        width: "100%",
        businessBeginsHour: 9,
        businessEndsHour: 17,
        startDate: DayPilot.Date.today(),
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

    const nav = new DayPilot.Navigator(navEl, {
        selectMode: "Week",
        showMonths: 1,
        skipMonths: 1,
        freeHandSelectionEnabled: true,
        onTimeRangeSelected: args => {
            calendar.startDate = args.start;
            calendar.days = args.days;
            calendar.update();
        }
    });

    calendar.events.list = await getCalEvents();
    nav.init()
    calendar.init();
}

async function getCalEvents() {
    // function to request all events for a list of calendar ids
    // within a defined time period

    const childSubCalendarIds = await getCalendars()
    const start = "2026-01-01T00:00:00Z"
    const end = "2027-02-01T00:00:00Z"
    const fetchPromises = childSubCalendarIds.map(async (id) => {
        const response = await fetch(
            AJS.contextPath() +
            `/rest/calendar-services/1.0/calendar/events.json` +
            `?subCalendarId=${id}` +
            `&start=${start}` +
            `&end=${end}`
        );

        if (!response.ok) {
            console.warn(`Failed to fetch events for ${id}`);
            return []; // return empty array on failure to avoid breaking Promise.all
        }

        const data = await response.json();
        return (data.events || []).flatMap(confluenceEventToDayPilotEvents);
    });

    // Wait for all requests to complete
    const allEventsArrays = await Promise.all(fetchPromises);

    // Flatten into a single array
    return allEventsArrays.flat();
}

async function getCalendars() {
    // requests confluence for all child calendars of the ska construction calendar
    // returns list of child calendar ids

    // public id
    // const skaConstructionCalId = "4cc239ae-8b4d-4d6d-b852-0aa439fd4dbb"

    // test id
    const skaConstructionCalId = "343f5d43-bca6-42a8-a1d1-af0bae92e1e0"

    const response = await fetch(
        AJS.contextPath() +
        "/rest/calendar-services/1.0/calendar/subcalendars.json?"
    );

    if (!response.ok) {
        throw new Error('Failed to fetch calendars');
    }

    const data = await response.json();

    // filter to skaConstructionCal
    const targetPayload = data.payload.find(
        entry => entry.subCalendar && entry.subCalendar.id === skaConstructionCalId
    );

    // create list of child calendars
    const childSubCalendarIds = targetPayload
        ? targetPayload.childSubCalendars.map(child => child.subCalendar.id)
        : [];

    return childSubCalendarIds
}

function confluenceEventToDayPilotEvents(event) {
    // creates a daypilot event for each station id in a confluence event
    // will not create an event if no station id is found

    const matchedResources = extractResourcesFromEvent(event);

    if (matchedResources.length === 0) {
        return [];
    }

    return matchedResources.map(resourceId => ({
        id: `${event.id}:${resourceId}`,
        parentId: event.id,
        text: event.title,
        start: applyTimezoneOffset(new Date(event.start)),
        end: applyTimezoneOffset(new Date(event.end)),
        resource: resourceId
    }));
}

function extractResourcesFromEvent(event) {
    // tests if station ids are mentioned in the 
    // description or title of a confluence event

    const STATION_IDS = ["s8-1", "s9-2", "s8-6", "s10-3"];
    const haystack = (
        (event.title || "") + " " +
        (event.description || "")
    ).toLowerCase();

    return STATION_IDS.filter(stationId =>
        haystack.includes(stationId.toLowerCase())
    );
}

function applyTimezoneOffset(dt) {
    return dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
}