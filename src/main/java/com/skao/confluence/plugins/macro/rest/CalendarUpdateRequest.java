package com.skao.confluence.plugins.macro.rest;

import java.util.List;

public class CalendarUpdateRequest {
    private long pageId;
    private List<Event> events;

    public long getPageId() { return pageId; }
    public void setPageId(long pageId) { this.pageId = pageId; }

    public List<Event> getEvents() { return events; }
    public void setEvents(List<Event> events) { this.events = events; }
}
