package com.skao.confluence.plugins.macro;

import com.atlassian.confluence.content.render.xhtml.ConversionContext;
import com.atlassian.confluence.macro.Macro;
import com.atlassian.confluence.macro.MacroExecutionException;
import com.atlassian.plugin.webresource.WebResourceManager;

import java.util.Map;

public class SkaLowStationBookings implements Macro {

    private final WebResourceManager webResourceManager;

    public SkaLowStationBookings(WebResourceManager webResourceManager) {
        this.webResourceManager = webResourceManager;
    }

    public String execute(Map<String, String> map, String s, ConversionContext conversionContext) throws MacroExecutionException {
        // Require the web resources for this macro
        webResourceManager.requireResource("com.skao.confluence.plugins.ska-low-confluence-calendar-macro:daypilot-resources");
        webResourceManager.requireResource("com.skao.confluence.plugins.ska-low-confluence-calendar-macro:ska-low-confluence-calendar-macro-resources");
        webResourceManager.requireResource("com.skao.confluence.plugins.ska-low-confluence-calendar-macro:ska-low-bootstrap-js");
        
        return "<div class='ska-low-station-bookings-macro'>" +  
                " <div class='daypilot-nav'></div>" +
                " <div class='daypilot'></div>" +
                "</div>";
    }

    public BodyType getBodyType() { return BodyType.NONE; }

    public OutputType getOutputType() { return OutputType.BLOCK; }
}