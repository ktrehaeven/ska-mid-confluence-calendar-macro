window.SkaLow = window.SkaLow || {};

window.SkaLow.initMap = function initMap(wrapper) {
    // function for initialising and displaying station map

    const mapEl = wrapper.querySelector('.map');
    if (!mapEl || mapEl.dataset.initialised) return;
    mapEl.dataset.initialised = "true";

    // Initialize Leaflet map
    const map = L.map(mapEl).setView([
        window.SkaLow.stationData.Centre.Latitude,
        window.SkaLow.stationData.Centre.Longitude],
        10);
    window.SkaLow.map = map;

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

    Object.entries(window.SkaLow.stationData).forEach(([key, station]) => {
        const marker = L.circleMarker(
            [station.Latitude, station.Longitude],
            {
                radius: 8,
                color: '#070068',
                fillColor: '#E70068',
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
        window.SkaLow.stationData[station.Label].marker = marker;
    });

    map.removeLayer(window.SkaLow.stationData.Airstrip.marker)
    window.SkaLow.stationData.Airstrip.marker = airstripPolyline

};

window.SkaLow.resetTooltips = function (map) {
    map.eachLayer(function (layer) {
        if (layer.options.pane === "tooltipPane") layer.removeFrom(map);
    });
}

window.SkaLow.updateVisibleResources = function () {
    // filters calender resources to only those that have events
    // in visible time window

    const calendar = window.SkaLow.calendar
    if (!calendar.visibleStart || !calendar.visibleEnd) return;

    const viewStart = calendar.visibleStart().getTime();
    const viewEnd = calendar.visibleEnd().getTime();

    const resourcesInView = window.SkaLow.stationList.filter(r =>
        calendar.events.list.some(e =>
            e.resource === r.id &&
            e.start < viewEnd &&
            e.end > viewStart
        )
    );

    calendar.resources = resourcesInView;
}

window.SkaLow.resetView = function (map) {
    map.flyTo([window.SkaLow.stationData.Centre.Latitude,
    window.SkaLow.stationData.Centre.Longitude], 10,
        { animate: true, duration: 0.5 });
}