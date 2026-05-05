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
     * Gets all dishes filtered by phase and all preceding phases
     * Supports NOT operations: "AAstar~M002" returns all AAstar dishes except M002
     * @param {Array<string>} phases - Phases to filter by (e.g., ["AA1", "AA0.5"])
     *                                  Can include NOT operations (e.g., ["AAstar~M002"])
     * @returns {Array} Filtered dishes in input phase and all preceding phases
     */
    getDishesByPhase(phases) {
        const phaseOrder = ["Airstrip", "MKT", "AA0_5", "AA1", "AA2", "AAstar", "AA4"];

        /**
         * Returns the list of included phases up to a given index,
         * applying the MKT inclusion rules.
         *
         * Rules:
         * - If AAstar or later is included → include everything from start
         * - If between MKT and AAstar → exclude early phases (Airstrip, MKT)
         * - Otherwise → only include early phases (Airstrip, MKT)
         *
         * @param {number} maxIndex - Highest phase index to include
         * @param {Array<string>} phaseOrder - Ordered list of phases
         * @returns {Array<string>} Included phases
         */
        function getFilteredPhases(maxIndex, phaseOrder) {
            const mktIndex = phaseOrder.indexOf("MKT");
            const aaStarIndex = phaseOrder.indexOf("AAstar");

            // Guard against invalid indices
            if (maxIndex < 0) return [];

            if (maxIndex >= aaStarIndex) {
                // Include all phases up to maxIndex
                return phaseOrder.slice(0, maxIndex + 1);
            }

            if (mktIndex < maxIndex && maxIndex < aaStarIndex) {
                // Skip early phases (Airstrip, MKT)
                return phaseOrder.slice(2, maxIndex + 1);
            }

            // Default: only early phases (Airstrip, MKT)
            return phaseOrder.slice(0, 2);
        }
        
        // Handle MKT separately - if explicitly selected, include only MKT dishes
        //if (phases.includes("MKT")) {
        //    return Object.values(this.dishData).filter(dish => dish.Phase === "MKT");
        //}
        
        // Handle NOT operations (e.g., "AAstar~M002" or "AA1~AA0.5")
        const notOperation = phases.find(p => p.includes("~"));
        if (notOperation) {
            const [included, excluded] = notOperation.split("~");
            
            // Check if excluded is a phase or a dish label
            const isExcludedPhase = phaseOrder.includes(excluded);
            
            if (isExcludedPhase) {
                // Phase NOT operation: "AA1~AA0.5" returns dishes in AA1 but not in AA0.5

                // Get the highest phase index from input phases
                // Get all phases up to and including the max phase
                // but only add MKT if AAstar or later phases are included
                const maxIncludedPhaseIndex = phaseOrder.indexOf(included);
                let includedPhases;
                includedPhases = getFilteredPhases(maxIncludedPhaseIndex, phaseOrder);

                // For the exclude phases
                const maxExcludedPhaseIndex = phaseOrder.indexOf(excluded);
                let excludedPhases;
                excludedPhases = getFilteredPhases(maxExcludedPhaseIndex, phaseOrder);
                
                return Object.values(this.dishData).filter(dish => 
                    includedPhases.includes(dish.Phase) && !excludedPhases.includes(dish.Phase)
                );

            } else {
                // Dish NOT operation: "AAstar~M002" returns all AAstar dishes except M002

                const maxExcludedPhaseIndex = phaseOrder.indexOf(excluded);
                let includedPhases;
                includedPhases = getFilteredPhases(maxIncludedPhaseIndex, phaseOrder);

                const excludedDishLabel = excluded;
                
                // Add MKT if the included phase is AAstar or later
                //if (phaseOrder.indexOf(included) >= phaseOrder.indexOf("AAstar")) {
                //    includedPhases.push("MKT");
                //}
                
                return Object.values(this.dishData).filter(dish => 
                    includedPhases.includes(dish.Phase) && dish.Label !== excludedDishLabel
                );
            }
        }
        
        // Get the highest phase index from input phases
        const maxPhaseIndex = Math.max(
            ...phases.map(p => phaseOrder.indexOf(p))
        );

        // Get all phases up to and including the max phase
        // but only add MKT if AAstar or later phases are included
        let includedPhases;
        includedPhases = getFilteredPhases(maxPhaseIndex, phaseOrder);
        
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