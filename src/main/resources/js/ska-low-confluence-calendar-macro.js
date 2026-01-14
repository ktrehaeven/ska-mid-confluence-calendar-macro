AJS.toInit(function () {
    // For each macro instance on the page
    document.querySelectorAll('.map-wrapper').forEach(function (wrapper) {
        const mapEl = wrapper.querySelector('.map');
        if (!mapEl || mapEl.dataset.initialised) return;
        mapEl.dataset.initialised = "true";

        // Initialize Leaflet map
        const map = L.map(mapEl).setView([51.505, -0.09], 13);

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);
    });
});