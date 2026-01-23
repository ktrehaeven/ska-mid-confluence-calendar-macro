AJS.toInit(function () {

    // shared registry to allow cross macro interaction
    window.SkaLowMaps = {
        map: null,
        calendar: null,
        stationData: {},
        stationList: []
    };

    // read stationLocations.json
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
                // save station lat and longs to shared registry
                window.SkaLowMaps.stationData[station.Label] = {
                    Label: station.Label,
                    Latitude: station.Latitude,
                    Longitude: station.Longitude
                };
            });
            // initialise each macro instance on the page
            document.querySelectorAll('.ska-low-map-macro').forEach(initMap);
            document.querySelectorAll('.ska-low-station-bookings-macro').forEach(initCalendar);
            window.SkaLowMaps.stationList = Object.keys(window.SkaLowMaps.stationData).map(name => ({
                name,
                id: name
            }))
        })

        .catch(err => {
            console.error("Station map error:", err);
        });
});

function initMap(wrapper) {
    // function for initialising and displaying station map

    const mapEl = wrapper.querySelector('.map');
    if (!mapEl || mapEl.dataset.initialised) return;
    mapEl.dataset.initialised = "true";

    // Initialize Leaflet map
    const map = L.map(mapEl).setView([
        window.SkaLowMaps.stationData.Centre.Latitude,
        window.SkaLowMaps.stationData.Centre.Longitude],
        10);
    window.SkaLowMaps.map = map;

    L.control.scale({ maxWidth: 300 }).addTo(map);
    L.control.resetView({}).addTo(map);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        minZoom: 2,
        maxZoom: 17,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    }).addTo(map);

    const airstripPolyline = L.polyline([
        ["-26.84110", "116.73869"],
        ["-26.84114", "116.74569"],
        ["-26.84114", "116.75297"]
    ], {
        color: 'black',
        weight: 5,
        opacity: 0.7
    }).bindTooltip(
        "Airstrip", {
        permanent: false,
        direction: "top",
        opacity: 0.8
    }).addTo(map)

    Object.entries(window.SkaLowMaps.stationData).forEach(([key, station]) => {
        const marker = L.circleMarker(
            [station.Latitude, station.Longitude],
            {
                radius: 8,
                color: '#0052CC',
                fillColor: '#18e01e',
                fillOpacity: 0.9
            }
        ).bindTooltip(
            station.Label,
            {
                permanent: false,
                direction: "right",
                offset: [10, 0],
                opacity: 0.8
            }
        ).addTo(map)
        window.SkaLowMaps.stationData[station.Label].marker = marker;
    });

    map.removeLayer(window.SkaLowMaps.stationData.Airstrip.marker)
    window.SkaLowMaps.stationData.Airstrip.marker = airstripPolyline

};

async function initCalendar(wrapper) {
    // function for initialising and displaying daypilot scheduler 

    const calendarEl = wrapper.querySelector('.daypilot');
    const navEl = wrapper.querySelector('.daypilot-nav');
    const map = window.SkaLowMaps.map;
    let selectedResourceId = null;

    if (!calendarEl || calendarEl.dataset.initialised) return;
    calendarEl.dataset.initialised = "true";

    window.SkaLowMaps.calendar = new DayPilot.Scheduler(calendarEl, {
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
        onRowClick: (args) => {
            //clicking new row: zoom and tooltip station
            if (args.row.id != selectedResourceId) {
                if (map) {
                    const station = window.SkaLowMaps.stationData[args.row.id];
                    map.flyTo(
                        [station.Latitude, station.Longitude], 13,
                        { animate: true, duration: 0.5 }
                    );

                    resetTooltips(map)
                    station.marker.openTooltip();
                }
                selectedResourceId = args.row.id;
                calendar.update();
            }
            //clicking same row: reset view
            else {
                if (map) {
                    resetView(map)
                    resetTooltips(map)
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
    const calendar = window.SkaLowMaps.calendar
    calendar.init();

    const nav = new DayPilot.Navigator(navEl, {
        selectMode: "Day",
        showMonths: 2,
        skipMonths: 1,
        freeHandSelectionEnabled: true,
        onTimeRangeSelected: args => {
            calendar.startDate = args.start;
            calendar.days = args.days;
            updateVisibleResources();
            calendar.update();
        }
    });
    nav.init()

    calendar.events.list = await getCalEvents();
    updateVisibleResources()
    calendar.update();
}

// --------- confluence utils ----------

async function getCalEvents() {
    // function to request all events for a list of calendar ids
    // within a defined time period

    const childSubCalendarIds = await getCalendars()
    const today = new DayPilot.Date().getDatePart()
    const start = today.addDays(-365).toString().replace(/Z?$/, "Z");
    const end = today.addDays(365).toString().replace(/Z?$/, "Z");
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
    const skaConstructionCalId = "9182d8de-2a71-43a5-8daf-8fa8b102d4f6"

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

    const stationsIds = Object.keys(window.SkaLowMaps.stationData);
    const haystack = (
        (event.title || "") + " " +
        (event.description || "")
    );

    return stationsIds.filter(stationId =>
        haystack.toUpperCase().includes(stationId.toUpperCase())
    );
}

function applyTimezoneOffset(dt) {
    return dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
}

// --------- map utils ----------

function resetTooltips(map) {
    map.eachLayer(function (layer) {
        if (layer.options.pane === "tooltipPane") layer.removeFrom(map);
    });
}

function updateVisibleResources() {
    // filters calender resources to only those that have events
    // in visible time window

    const calendar = window.SkaLowMaps.calendar
    if (!calendar.visibleStart || !calendar.visibleEnd) return;

    const viewStart = calendar.visibleStart().getTime();
    const viewEnd = calendar.visibleEnd().getTime();

    const resourcesInView = window.SkaLowMaps.stationList.filter(r =>
        calendar.events.list.some(e =>
            e.resource === r.id &&
            e.start < viewEnd &&
            e.end > viewStart
        )
    );

    calendar.resources = resourcesInView;
}

function resetView(map) {
    map.flyTo([window.SkaLowMaps.stationData.Centre.Latitude,
    window.SkaLowMaps.stationData.Centre.Longitude], 10,
        { animate: true, duration: 0.5 });
}