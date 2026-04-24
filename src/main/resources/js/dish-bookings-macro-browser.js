/**
 * Macro Browser Override for SKA-Mid Dish Bookings Macro
 *
 * Registers a custom field override with the Confluence Macro Browser so that
 * the "Calendar" parameter on the ska-mid-dish-bookings-macro renders as a
 * multi-select calendar picker rather than a plain text input.
 *
 * This file is loaded automatically by Confluence whenever the Macro Browser
 * opens, via the <context>macro-browser</context> declaration in atlassian-plugin.xml.
 *
 * The selected calendar IDs are stored as a comma-separated string in the
 * hidden macro parameter named "id", and are embedded by SkaMidDishBookings.java
 * as a data-calendar-ids attribute on the macro wrapper div at render time.
 */
(function ($, Meta) {
    var isAnonymous = Meta.get('remote-user') === '';

    /**
     * Builds the field overrides object passed to AJS.MacroBrowser.setMacroJsOverride.
     *
     * @returns {Object} Field overrides map: { "string": { "Calendar": fn } }
     */
    function getFieldsOverride() {
        return {
            "string": {
                "Calendar": function (param, options) {

                    if (isAnonymous) {
                        return AJS.MacroBrowser.ParameterFields['_hidden'](param, {});
                    }

                    var parameterContainer;

                    // AJS.MacroBrowser.makeParameterDiv was removed in a later version of
                    // Confluence — fall back to the standard ParameterFields renderer if absent
                    if (AJS.MacroBrowser.makeParameterDiv) {
                        parameterContainer = AJS.MacroBrowser.makeParameterDiv({}, { name: "Calendar", type: "string" });
                    } else {
                        parameterContainer = AJS.MacroBrowser.ParameterFields["string"](param, options).paramDiv;
                    }

                    var subCalendarSelect = $("<input/>", { "class": "subcalendars-select", "type": "hidden" });
                    var subCalendarsInput = $("input", parameterContainer).addClass("hidden").after(subCalendarSelect);

                    /**
                     * Synchronises the hidden input value with the Select2 selection,
                     * and pre-populates the Select2 display when editing an existing macro
                     * by fetching calendar names for the stored IDs.
                     *
                     * @param {string|string[]} subCalendarIds - One or more calendar UUIDs
                     */
                    var setValue = function (subCalendarIds) {
                        if (subCalendarIds) {
                            var subCalendarIdsString = $.isArray(subCalendarIds) ? subCalendarIds.join(",") : subCalendarIds;
                            subCalendarsInput.val(subCalendarIdsString);

                            // Only resolve names on the first setValue call to avoid
                            // re-rendering user selections during typing
                            if (!subCalendarsInput.data("renderedInitialSelection")) {
                                subCalendarsInput.data("renderedInitialSelection", true);

                                // Resolve UUIDs to display names for the initial selection
                                $.ajax({
                                    cache: false,
                                    data: { subCalendarIds: subCalendarIdsString },
                                    dataType: "json",
                                    success: function (subCalendars) {
                                        if (subCalendars && $.isArray(subCalendars)) {
                                            subCalendarSelect.auiSelect2("data", $.map(subCalendars, function (aSubCalendar) {
                                                return {
                                                    "id": aSubCalendar.id,
                                                    "text": $("<span/>", { "text": aSubCalendar.name }).html()
                                                };
                                            }));
                                        }
                                    },
                                    timeout: 10000,
                                    url: AJS.contextPath() + "/rest/calendar-services/1.0/calendar/util/format/subcalendar/ids.json"
                                });
                            }
                        } else {
                            subCalendarsInput.val("");
                        }

                        subCalendarsInput.trigger("change");
                    };

                    // Initialise Select2 on the visible input and wire its change
                    // event back to setValue so the hidden input stays in sync
                    subCalendarSelect.change(function () {
                        setValue($.trim(subCalendarSelect.auiSelect2("val")));
                    }).auiSelect2({
                        "minimumInputLength": 1,
                        "formatNoMatches": function (searchTerm) {
                            return $("<div/>").append(
                                $("<span/>", { "text": AJS.format("No calendars found with {0}.", searchTerm || "") })
                            ).html();
                        },
                        "formatInputTooShort": function () {
                            return $("<div/>").append(
                                $("<span/>", { "text": "Start typing for calendar suggestions" })
                            ).html();
                        },
                        "multiple": true,
                        /**
                         * Typeahead query function — called by Select2 on each keystroke.
                         * Searches Team Calendars via REST and returns matching calendars
                         * as { id, text } pairs for Select2 to display.
                         *
                         * @param {Object} options - Select2 query options including options.term and options.callback
                         */
                        "query": function (options) {
                            $.ajax({
                                "cache": false,
                                "data": {
                                    term: options.term,
                                    limit: 5,
                                    showSubCalendarsInView: "true"
                                },
                                "dataType": "json",
                                "success": function (searchResults) {
                                    options.callback({
                                        "results": (function () {
                                            if (searchResults.payload && searchResults.payload.length) {
                                                return $.map(searchResults.payload, function (payload) {
                                                    return {
                                                        "id": payload.subCalendar.id,
                                                        "text": $("<span/>", { "text": payload.subCalendar.name }).html()
                                                    };
                                                });
                                            }
                                            return [];
                                        })(),
                                        "more": false
                                    });
                                    // Workaround for CONFDEV-15071 — Select2 drop loses its
                                    // active class in some Confluence versions
                                    $(".select2-drop-active").addClass("select2-drop");
                                },
                                timeout: 10000,
                                "url": AJS.contextPath() + "/rest/calendar-services/1.0/calendar/search/subcalendars.json"
                            });
                        }
                    });

                    // Helper text shown below the Select2 widget
                    $(".select2-container", parameterContainer).after(
                        $("<div/>", { "class": "id-desc", "text": "Start typing for calendar suggestions." })
                    );

                    // Wrap in an AJS.MacroBrowser.Field so the Macro Browser can call
                    // setValue when pre-populating the form for an existing macro
                    return AJS.MacroBrowser.Field(parameterContainer, subCalendarsInput, $.extend({
                        setValue: function (value) {
                            setValue(value);
                        }
                    }), options);
                }
            }
        };
    }

    AJS.MacroBrowser.setMacroJsOverride('ska-mid-dish-bookings-macro', {
        fields: getFieldsOverride()
    });

})(AJS.$, AJS.Meta);