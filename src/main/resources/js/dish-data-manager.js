/**
 * Manages dish data loading and caching
 */
class DishDataManager {
    constructor() {
        this.dishData = {};
        this.dishList = [];
        this.isLoaded = false;
    }

    /**
     * Loads dish data from the server
     * @returns {Promise<void>}
     */
    async load() {
        if (this.isLoaded) {
            return Promise.resolve();
        }

        try {
            const response = await fetch(
                AJS.contextPath() + '/download/resources/com.skao.confluence.plugins.ska-mid-confluence-calendar-macro:' +
                'ska-mid-confluence-calendar-macro-resources/dishLocations.json'
            );

            if (!response.ok) {
                throw new Error("Failed to load dishLocations.json");
            }

            const dishes = await response.json();
            this.parseDishes(dishes);
            this.isLoaded = true;
        } catch (err) {
            console.error("Dish data loading error:", err);
            throw err;
        }
    }

    /**
     * Parses dish data and populates internal structures
     * @private
     * @param {Array} dishes - Array of dish objects
     */
    parseDishes(dishes) {
        dishes.forEach(dish => {
            this.dishData[dish.Label] = {
                Label: dish.Label,
                Latitude: dish.Latitude,
                Longitude: dish.Longitude,
                Phase: dish["Project Stage"]
            };
        });

        this.dishList = Object.keys(this.dishData).map(name => ({
            name,
            id: name
        }));
    }

    /**
     * Gets a dish by its label/id
     * @param {string} id - Dish label/id (e.g., "M001")
     * @returns {Object|null} Dish data or null if not found
     */
    getDish(id) {
        return this.dishData[id] || null;
    }

    /**
     * Helper: determine included phases based on max index
     */
    getIncludedPhases(maxIndex, phaseOrder) {
        const mktIndex = phaseOrder.indexOf("MKT");
        const aaStarIndex = phaseOrder.indexOf("AAstar");

        if (maxIndex < 0) return [];

        if (maxIndex >= aaStarIndex) {
            return phaseOrder.slice(0, maxIndex + 1);
        }

        if (mktIndex < maxIndex && maxIndex < aaStarIndex) {
            return phaseOrder.slice(2, maxIndex + 1);
        }

        return phaseOrder.slice(0, 2);
    }

    /**
     * Gets all dishes filtered by phase and all preceding phases
     * Supports NOT operations: "AAstar~M002" returns all AAstar dishes except M002
     * @param {Array<string>} phases
     * @returns {Array}
     */
    getDishesByPhase(phases) {
        const phaseOrder = ["Airstrip", "MKT", "AA0.5", "AA1", "AA2", "AAstar", "AA4"];

        let includedPhases;
        let excludedPhases;

        // Handle NOT operations
        const notOperation = phases.find(p => p.includes("~"));

        if (notOperation) {
            const [included, excluded] = notOperation.split("~");
            const isExcludedPhase = phaseOrder.includes(excluded);

            // --- PHASE NOT ---
            if (isExcludedPhase) {
                const includedIndex = phaseOrder.indexOf(included);
                const excludedIndex = phaseOrder.indexOf(excluded);

                includedPhases = this.getIncludedPhases(includedIndex, phaseOrder);
                excludedPhases = this.getIncludedPhases(excludedIndex, phaseOrder);

                return Object.values(this.dishData).filter(dish =>
                    includedPhases.includes(dish.Phase) &&
                    !excludedPhases.includes(dish.Phase)
                );
            }

            // --- DISH NOT ---
            const includedIndex = phaseOrder.indexOf(included);
            includedPhases = this.getIncludedPhases(includedIndex, phaseOrder);

            return Object.values(this.dishData).filter(dish =>
                includedPhases.includes(dish.Phase) &&
                dish.Label !== excluded
            );
        }

        // --- NORMAL CASE ---
        const maxPhaseIndex = Math.max(
            ...phases.map(p => phaseOrder.indexOf(p))
        );

        includedPhases = this.getIncludedPhases(maxPhaseIndex, phaseOrder);

        return Object.values(this.dishData).filter(dish =>
            includedPhases.includes(dish.Phase)
        );
    }
    
    /**
    * Gets all dish labels
    * @returns {Array<string>} Dish labels
    */
    getAllDishLabels() {
        return Object.keys(this.dishData);
    }
}

window.DishDataManager = DishDataManager;