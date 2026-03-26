function waitForClass(className, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        (function check() {
            if (typeof window[className] !== 'undefined') {
                resolve(window[className]);
            } else if (Date.now() - start > timeout) {
                reject(new Error(className + ' did not load within ' + timeout + 'ms'));
            } else {
                setTimeout(check, 50);
            }
        })();
    });
}

AJS.toInit(async function () {
    try {
        const SkaLowCalendarMacro = await waitForClass('SkaLowCalendarMacro');
        const macro = new SkaLowCalendarMacro();
        window.SkaLow = window.SkaLow || {};
        window.SkaLow.macro = macro;
        await macro.initialize();
    } catch (err) {
        console.error("SKA-Low Calendar Macro initialization error:", err);
    }
});