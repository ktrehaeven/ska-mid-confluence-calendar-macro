AJS.toInit(async function () {
    try {
        const SkaMidCalendarMacro = window.SkaMidCalendarMacro;
        const macro = new SkaMidCalendarMacro();
        window.SkaMid = window.SkaMid || {};
        window.SkaMid.macro = macro;
        await macro.initialize();
    } catch (err) {
        console.error("SKA-Mid Calendar Macro initialization error:", err);
    }
});