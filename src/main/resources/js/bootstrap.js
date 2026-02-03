AJS.toInit(async function () {
    try {
        // Initialize the main macro orchestrator
        const macro = new SkaLowCalendarMacro();

        // Make it available globally for debugging/cross-component access if needed
        window.SkaLow = window.SkaLow || {};
        window.SkaLow.macro = macro;

        // Initialize all components
        await macro.initialize();
    } catch (err) {
        console.error("SKA-Low Calendar Macro initialization error:", err);
    }
});