package com.skao.confluence.plugins.macro;
import com.atlassian.confluence.content.render.xhtml.ConversionContext;
import com.atlassian.confluence.macro.Macro;
import com.atlassian.confluence.macro.MacroExecutionException;
import com.atlassian.plugin.webresource.WebResourceManager;
import java.util.Map;

public class SkaMidDishBookings implements Macro {

    private final WebResourceManager webResourceManager;

    public SkaMidDishBookings(WebResourceManager webResourceManager) {
        this.webResourceManager = webResourceManager;
    }

    public String execute(Map<String, String> map, String s, ConversionContext conversionContext) throws MacroExecutionException {

        // parameter passed in from the macro browser, should be a comma separated list of sub calendar ids
        String subCalendarIds = map.get("Calendar");
        if (subCalendarIds == null) subCalendarIds = "";

        webResourceManager.requireResource("com.skao.confluence.plugins.ska-mid-confluence-calendar-macro:daypilot-resources");
        webResourceManager.requireResource("com.skao.confluence.plugins.ska-mid-confluence-calendar-macro:ska-mid-confluence-calendar-macro-resources");
        webResourceManager.requireResource("com.skao.confluence.plugins.ska-mid-confluence-calendar-macro:ska-mid-bootstrap-js");

        return "<div class='ska-mid-dish-bookings-macro' data-calendar-ids='" + subCalendarIds + "'>" +
            "<div class='nav-panel'>" +
                "<div class='daypilot-nav'></div>" +
            "</div>" +
            "<div class='daypilot'></div>" +
        "</div>";
    }

    public BodyType getBodyType() { return BodyType.NONE; }
    public OutputType getOutputType() { return OutputType.BLOCK; }
}