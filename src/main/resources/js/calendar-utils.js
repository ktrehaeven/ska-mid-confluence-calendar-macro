window.SkaLow = window.SkaLow || {};

window.SkaLow.getCalEvents = async function () {
    // function to request all events for a list of calendar ids
    // within a defined time period

    const childSubCalendarIds = await window.SkaLow.getCalendars()
    const today = new DayPilot.Date().getDatePart()
    const start = ensureZulu(today.addDays(-365).toString())
    const end = ensureZulu(today.addDays(365).toString())
    const fetchPromises = Object.entries(childSubCalendarIds).map(
        async ([name, id]) => {
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

    const skaConstructionCalName = "SKA-Low Telescope Construction"

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
        entry => entry.subCalendar && entry.subCalendar.name === skaConstructionCalName
    );

    // create dictionary of child calendars
    const childSubCalendarIds = Object.fromEntries(
        targetPayload.childSubCalendars.flatMap(child => {
            const sub = child.subCalendar;
            if (!sub?.customEventTypes?.length) return [];

            return sub.customEventTypes.map(type => [
                type.title,
                sub.id
            ]);
        })
    );

    // create dictionary of event types
    const customEventTypes = targetPayload.childSubCalendars.flatMap(child => {
        const sub = child.subCalendar;
        if (!sub?.customEventTypes?.length) return [];

        return sub.customEventTypes.map(type => ({
            name: type.title,
            id: type.customEventTypeId
        }));
    });

    window.SkaLow.skaConstructionCalId = targetPayload.subCalendar.id
    window.SkaLow.childSubCalendarIds = childSubCalendarIds
    window.SkaLow.customEventTypes = customEventTypes

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
        // who: event.who,
        start: window.SkaLow.applyTimezoneOffset(new Date(event.start)),
        end: window.SkaLow.applyTimezoneOffset(new Date(event.end)),
        description: event.description,
        resource: resourceId,
        barColor: "#070068",
        confirmRemoveInvalidUsers: "false",
        eventType: "other",
        subCalendarId: self.subCalendarId,
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

function ensureZulu(s) {
    return s.replace(/Z?$/, "Z");
}

window.SkaLow.convertToConfluenceDate = function (dateString) {
    const dateObject = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = new Intl.DateTimeFormat('en-US', options).format(dateObject);

    return (formattedDate);
}

window.SkaLow.convertToConfluenceTime = function (dateString) {
    const dateObject = new Date(dateString);
    const options = { hour: 'numeric', minute: '2-digit', hour12: true };
    const formattedDate = new Intl.DateTimeFormat('en-US', options).format(dateObject);

    return (formattedDate);
}

window.SkaLow.createEvent = async function (body) {
    const url = AJS.contextPath() + "/rest/calendar-services/1.0/calendar/events.json";

    // Convert object to URL-encoded form data
    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && value !== null) {
            formData.append(key, value);
        }
    }

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest"
        },
        body: formData.toString()
    });

    if (!response.ok) {
        throw new Error(`Failed to create event: ${response.status} ${response.statusText}`);
    }

    return await response.json();
}

window.SkaLow.showEventForm = async function (data) {

    const eventForm = [
        { name: "Title", id: "text", type: "text" },
        { name: "Event Type", id: "type", options: window.SkaLow.customEventTypes, type: "select" },
        // { name: "Who", id: "who", type: "text" },
        { name: "Start", id: "start", type: "datetime", timeInterval: 5 },
        { name: "End", id: "end", type: "datetime", timeInterval: 5 },
        { name: "Station", id: "station", type: "text" },
        { name: "Description", id: "description", type: "textarea" }
    ];

    const modal = await DayPilot.Modal.form(eventForm, data, {
        width: 450,
        height: 420,
        scrollWithPage: false
    });

    if (modal.canceled) return null;
    return modal.result;
}