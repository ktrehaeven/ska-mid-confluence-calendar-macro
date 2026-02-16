package com.skao.confluence.plugins.macro;

import com.atlassian.confluence.content.render.xhtml.ConversionContext;
import com.atlassian.confluence.macro.Macro;
import com.atlassian.confluence.macro.MacroExecutionException;
import com.atlassian.plugin.webresource.WebResourceManager;

import java.util.Map;

public class SkaLowMap implements Macro {

    private final WebResourceManager webResourceManager;

    public SkaLowMap(WebResourceManager webResourceManager) {
        this.webResourceManager = webResourceManager;
    }

    @Override
    public String execute(Map<String, String> params, String body, ConversionContext ctx)
            throws MacroExecutionException {

        // Require the web resources for this macro
        webResourceManager.requireResource("com.skao.confluence.plugins.ska-low-confluence-calendar-macro:leaflet-resources");
        webResourceManager.requireResource("com.skao.confluence.plugins.ska-low-confluence-calendar-macro:ska-low-bootstrap-js");

        // HTML wrapper for the Leaflet map
        return "<div class='ska-low-map-macro'>" +  
            " <div class='map-wrapper'>" +
            " <div class='map'></div>" +
            "</div>" +
            "</div>";
    }

    @Override
    public BodyType getBodyType() {
        return BodyType.NONE;
    }

    @Override
    public OutputType getOutputType() {
        return OutputType.BLOCK;
    }
}