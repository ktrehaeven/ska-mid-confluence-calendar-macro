package com.skao.confluence.plugins.macro.rest;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class CalendarStorageUpdater {

    public static String replaceCalendarEvents(String storage, List<Event> events) throws Exception {

        String eventsJson = new ObjectMapper().writeValueAsString(events);

        Pattern pattern = Pattern.compile(
            "(<ac:structured-macro[^>]*ac:name=\"calendar\"[\\s\\S]*?<ac:parameter ac:name=\"events\">)([\\s\\S]*?)(</ac:parameter>)"
        );

        Matcher matcher = pattern.matcher(storage);

        if (matcher.find()) {
            return matcher.replaceFirst("$1" + eventsJson + "$3");
        }

        return storage;
    }
}