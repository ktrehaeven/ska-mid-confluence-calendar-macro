window.SkaLow = window.SkaLow || {};

window.SkaLow.getCalEvents = async function () {
    // function to request all events for a list of calendar ids
    // within a defined time period

    const childSubCalendarIds = await window.SkaLow.getCalendars()
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
        return (data.events || []).flatMap(window.SkaLow.confluenceEventToDayPilotEvents);
    });

    // Wait for all requests to complete
    const allEventsArrays = await Promise.all(fetchPromises);

    // Flatten into a single array
    return allEventsArrays.flat();
}

window.SkaLow.getCalendars = async function () {
    // requests confluence for all child calendars of the ska construction calendar
    // returns list of child calendar ids

    // public id
    const skaConstructionCalId = "4cc239ae-8b4d-4d6d-b852-0aa439fd4dbb"

    // test id
    // const skaConstructionCalId = "9182d8de-2a71-43a5-8daf-8fa8b102d4f6"

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

window.SkaLow.confluenceEventToDayPilotEvents = function (event) {
    // creates a daypilot event for each station id in a confluence event
    // will not create an event if no station id is found

    const matchedResources = window.SkaLow.extractResourcesFromEvent(event);

    if (matchedResources.length === 0) {
        return [];
    }

    return matchedResources.map(resourceId => ({
        id: `${event.id}:${resourceId}`,
        parentId: event.id,
        text: event.title,
        start: window.SkaLow.applyTimezoneOffset(new Date(event.start)),
        end: window.SkaLow.applyTimezoneOffset(new Date(event.end)),
        resource: resourceId,
        barColor: "#070068"
    }));
}

window.SkaLow.extractResourcesFromEvent = function (event) {
    // tests if station ids are mentioned in the 
    // description or title of a confluence event

    const stationsIds = Object.keys(window.SkaLow.stationData);
    const haystack = (
        (event.title || "") + " " +
        (event.description || "")
    );

    return stationsIds.filter(stationId =>
        haystack.toUpperCase().includes(stationId.toUpperCase())
    );
}

window.SkaLow.applyTimezoneOffset = function (dt) {
    return dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
}