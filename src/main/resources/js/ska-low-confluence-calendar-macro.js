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

    // Add OpenStreetMap tiles
    L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.{ext}', {
        minZoom: 0,
        maxZoom: 19,
        attribution: '&copy; CNES, Distribution Airbus DS, © Airbus DS, © PlanetObserver (Contains Copernicus Data) | '
            + '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> '
            + '&copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> '
            + '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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

function initBookings(wrapper) {
    const calendarEl = wrapper.querySelector('.daypilot');
    if (!calendarEl || calendarEl.dataset.initialised) return;

    calendarEl.dataset.initialised = "true";

    const calendar = new DayPilot.Scheduler(calendarEl, {
        viewType: "Resources",
        startDate: DayPilot.Date.today(),
        businessBeginsHour: 8,
        businessEndsHour: 18,
        timeRangeSelectedHandling: "Enabled",
        resources: [
            { name: "s8-1", id: "s8-1" },
            { name: "s9-2", id: "s9-2" },
            { name: "s8-6", id: "s8-6" },
            { name: "s10-3", id: "s10-3" }
        ]
    });

    calendar.init();
}
