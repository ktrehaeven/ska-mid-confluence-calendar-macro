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
     * @param {string} id - Dish label/id
     * @returns {Object|null} Dish data or null if not found
     */
    getDish(id) {
        return this.dishData[id] || null;
    }

    /**
     * Gets all dishes filtered by phase
     * @param {Array<string>} phases - Phases to filter by (e.g., ["AA1", "AA0.5"])
     * @returns {Array} Filtered dishes
     */
    getDishesByPhase(phases) {
        return Object.values(this.dishData).filter(dish =>
            phases.includes(dish.Phase)
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