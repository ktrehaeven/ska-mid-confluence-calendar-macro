AJS.toInit(async function () {
    try {
        const SkaLowCalendarMacro = window.SkaLowCalendarMacro;
        const macro = new SkaLowCalendarMacro();
        window.SkaLow = window.SkaLow || {};
        window.SkaLow.macro = macro;
        await macro.initialize();
    } catch (err) {
        console.error("SKA-Low Calendar Macro initialization error:", err);
    }
});