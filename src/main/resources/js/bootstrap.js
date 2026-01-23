AJS.toInit(function () {

    // shared registry to allow cross macro interaction
    window.SkaLow = window.SkaLow || {};
    window.SkaLow.map = null;
    window.SkaLow.calendar = null;
    window.SkaLow.stationData = {};
    window.SkaLow.stationList = [];

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
                window.SkaLow.stationData[station.Label] = {
                    Label: station.Label,
                    Latitude: station.Latitude,
                    Longitude: station.Longitude
                };
            });
            // initialise each macro instance on the page
            document.querySelectorAll('.ska-low-map-macro').forEach(window.SkaLow.initMap);
            document.querySelectorAll('.ska-low-station-bookings-macro').forEach(window.SkaLow.initCalendar);
            // list of stations for easy access to calendar
            window.SkaLow.stationList = Object.keys(window.SkaLow.stationData).map(name => ({
                name,
                id: name
            }))
        })

        .catch(err => {
            console.error("Station map error:", err);
        });
});