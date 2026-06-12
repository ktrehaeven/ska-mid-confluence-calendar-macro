package com.skao.confluence.plugins.macro;

import com.atlassian.confluence.macro.Macro;
import com.atlassian.confluence.macro.MacroExecutionException;
import com.atlassian.confluence.renderer.radeox.macros.MacroUtils;
import com.atlassian.confluence.content.render.xhtml.ConversionContext;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

public class SkaMidTableMacro implements Macro {

    @Override
    public String execute(Map<String, String> params,
                          String body,
                          ConversionContext context)
            throws MacroExecutionException {

        try {
            InputStream inputStream = getClass()
                    .getResourceAsStream("/data/Timeline.html");

            return new String(inputStream.readAllBytes(),
                    StandardCharsets.UTF_8);

        } catch (Exception e) {
            return "<p>Error loading Timeline.</p>";
        }
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
