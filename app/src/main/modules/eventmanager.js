const { session } = require("electron");
const fs = require('fs');
const path = require('path');
const { parseISO, formatISO, addDays, addWeeks, addMonths, addYears } = require('date-fns');
const Database = require('better-sqlite3');
const config = require('./config');
const SCHEDULE_DIR = config.USER_DIR;


/**
 * EVENT DATA FORMAT
 * {
  event_id: "uuid-string",
  title: "Math Lecture",
  description: "Weekly math class",
  repeat: {
    type: "weekly",   could be "daily", "weekly", "yearly", or null
    interval: 1,
    until: null       null = indefinite, or ISO date string like "2025-12-31T23:59:59Z"
  },
  instances: [
    {
      start: "2025-06-05T10:00:00Z",
      end: "2025-06-05T11:00:00Z",
      continue: true    // null = end here, true = continue generating more instances
    }
    // For indefinite repeats, system generates first year of instances
    // When queried beyond generated range, checks last instance's "continue" flag
    // If continue=true, generates next year chunk automatically
  ]
}
*/

/**
 * Manages user events and schedules using SQLite databases.
 */
class EventManager{
    /**
     * Returns the path to the user's schedule directory, creating it if it doesn't exist.
     * @param {string} userId - The user's unique ID.
     * @returns {string} - The absolute path to the user's directory.
     */
    getUserDir(userId) {
        const dir = path.join(SCHEDULE_DIR, userId);
        if(!fs.existsSync(dir)){
            fs.mkdirSync(dir);
        }
        return dir;
    }
    /**
     * Returns the raw content of the user's database file if it exists.
     * @param {string} userId - The user's unique ID.
     * @returns {Buffer|null} - The raw buffer of the database file, or null if not found.
     */
    getUserDatabaseFile(userId) {
        const dbPath = path.join(this.getUserDir(userId), 'schedule.db');
        if (fs.existsSync(dbPath)) {
            return fs.readFileSync(dbPath); // Return the raw buffer
        }
        return null;
    }
    /**
     * Initializes and returns the user's SQLite database.
     * Creates tables if they do not already exist.
     * @param {string} userId - The user's unique ID.
     * @returns {Database} - The initialized SQLite database instance.
     */
    getUserScheduleDB(userId){
        const userDbPath = path.join(this.getUserDir(userId),'schedule.db');
        const db = new Database(userDbPath);
        db.exec(`
            CREATE TABLE IF NOT EXISTS EVENT (
            event_id TEXT PRIMARY KEY,
            title TEXT,
            description TEXT,
            repeat TEXT
            );

            CREATE TABLE IF NOT EXISTS EVENT_DETAILS (
            event_id TEXT,
            start TEXT,
            end TEXT,
            continue INTEGER DEFAULT NULL,
            FOREIGN KEY(event_id) REFERENCES EVENT(event_id)
            );
        `);

        return db;
    }
    /**
     * Generates repeating instances of an event based on its repeat rule.
     * @param {Object} first - First instance with start and end in ISO format.
     * @param {Object} repeat - Repeat configuration object.
     * @param {string} [generateUntil=null] - Optional override for when to stop generating.
     * @returns {Array<Object>} - List of generated event instances.
     */
    generateRepeatingInstances(first, repeat, generateUntil = null) {
        const results = [first];
        if (!repeat) return results;

        const interval = repeat.interval || 1;

        // Parse dates and calculate duration
        const baseStart = parseISO(first.start);
        const baseEnd = parseISO(first.end);
        const durationMs = baseEnd - baseStart;

        // Determine when to stop
        let endDate;
        if (generateUntil) {
            endDate = parseISO(generateUntil);
        } else if (repeat.until) {
            endDate = parseISO(repeat.until);
        } else {
            endDate = new Date(Date.UTC(
                baseStart.getUTCFullYear() + 1,
                baseStart.getUTCMonth(),
                baseStart.getUTCDate(),
                baseStart.getUTCHours(),
                baseStart.getUTCMinutes(),
                baseStart.getUTCSeconds(),
                baseStart.getUTCMilliseconds()
            ));
        }

        const addFnMap = {
            daily: (date, days) => {
                return new Date(Date.UTC(
                    date.getUTCFullYear(),
                    date.getUTCMonth(),
                    date.getUTCDate() + days,
                    date.getUTCHours(),
                    date.getUTCMinutes(),
                    date.getUTCSeconds(),
                    date.getUTCMilliseconds()
                ));
            },
            weekly: (date, weeks) => {
                return addFnMap.daily(date, weeks * 7);  // Now this works
            },
            monthly: (date, months) => {
                const year = date.getUTCFullYear();
                const month = date.getUTCMonth();
                const day = date.getUTCDate();

                const result = new Date(Date.UTC(
                    year,
                    month + months,
                    day,
                    date.getUTCHours(),
                    date.getUTCMinutes(),
                    date.getUTCSeconds(),
                    date.getUTCMilliseconds()
                ));

                // Handle end-of-month overflow
                if (result.getUTCDate() < day) {
                    result.setUTCDate(0);
                }

                return result;
            },
            yearly: (date, years) => {
                const year = date.getUTCFullYear();
                const month = date.getUTCMonth();
                const day = date.getUTCDate();

                const result = new Date(Date.UTC(
                    year + years,
                    month,
                    day,
                    date.getUTCHours(),
                    date.getUTCMinutes(),
                    date.getUTCSeconds(),
                    date.getUTCMilliseconds()
                ));

                // Handle leap year (Feb 29 → Feb 28)
                if (month === 1 && day === 29 && result.getUTCDate() !== 29) {
                    result.setUTCDate(28);
                }

                return result;
            }
        };

        const addFn = addFnMap[repeat.type];


        if (!addFn) return results;

        let iterations = 0;
        while (true) {
            iterations++;

            const instanceStart = addFn(baseStart, interval * iterations);
            const instanceEnd = new Date(instanceStart.getTime() + durationMs);

            if (instanceStart > endDate) break;

            const nextStart = addFn(baseStart, interval * (iterations + 1));
            const isLastInstance = nextStart > endDate;

            results.push({
                start: formatISO(instanceStart),
                end: formatISO(instanceEnd),
                continue: repeat.until ? null : (isLastInstance ? true : null)
            });
        }

        return results;
    }

    /**
     * Generates an additional year of repeated event instances if needed.
     * @param {string} userId - The user's unique ID.
     * @param {string} eventId - The ID of the repeating event.
     * @returns {Object} - Result object indicating success and number of instances generated.
     */
    generateNextYearChunk(userId, eventId) {
        const db = this.getUserScheduleDB(userId);
        
        // Get event data and last instance
        const eventStmt = db.prepare(`SELECT * FROM EVENT WHERE event_id = ?`);
        const event = eventStmt.get(eventId);
        
        if (!event || !event.repeat) return { success: false, message: 'Event not found or not repeating' };
        
        const repeat = JSON.parse(event.repeat);
        if (!repeat || repeat.until) return { success: false, message: 'Event has fixed end date' };

        // Get the last instance
        const lastInstanceStmt = db.prepare(`
            SELECT * FROM EVENT_DETAILS 
            WHERE event_id = ? 
            ORDER BY start DESC 
            LIMIT 1
        `);
        const lastInstance = lastInstanceStmt.get(eventId);
        
        if (!lastInstance || lastInstance.continue !== 1) {
            return { success: false, message: 'No continuation needed' };
        }

        // Generate next year from the last instance
        const nextYearStart = addYears(parseISO(lastInstance.start), 1);
        const firstNewInstance = {
            start: formatISO(nextYearStart),
            end: formatISO(addYears(parseISO(lastInstance.end), 1)),
            continue: null
        };

        const newInstances = this.generateRepeatingInstances(firstNewInstance, repeat);
        
        // Insert new instances
        const insertDetail = db.prepare(`
            INSERT INTO EVENT_DETAILS (event_id, start, end, continue)
            VALUES (?, ?, ?, ?)
        `);

        const insertMany = db.transaction((items) => {
            for (const inst of items) {
                insertDetail.run(
                    eventId,
                    inst.start,
                    inst.end,
                    inst.continue === true ? 1 : (inst.continue === false ? 0 : null)
                );
            }
        });
        insertMany(newInstances);

        return { success: true, generated: newInstances.length };
    }
    /**
     * Creates a new event with associated time instances for a user.
     * Handles both one-time and repeating events.
     * @param {string} userId - The user's unique ID.
     * @param {Object} eventData - Event data including event_id, title, description, repeat, and instances.
     * @returns {Object} - Result indicating success.
     */
    createEventForUser(userId, eventData) {
        const db = this.getUserScheduleDB(userId);

        const insertEvent = db.prepare(`
            INSERT INTO EVENT (event_id, title, description, repeat)
            VALUES (?, ?, ?, ?)
        `);

        const insertDetail = db.prepare(`
            INSERT INTO EVENT_DETAILS (event_id, start, end, continue)
            VALUES (?, ?, ?, ?)
        `);

        const repeatJson = eventData.repeat ? JSON.stringify(eventData.repeat) : null;
        insertEvent.run(eventData.event_id, eventData.title, eventData.description, repeatJson);

        let instances = eventData.instances;
        if (eventData.repeat) {
            const firstInstance = eventData.instances[0];
            instances = this.generateRepeatingInstances(firstInstance, eventData.repeat);
        }

        const insertMany = db.transaction((items) => {
            for (const inst of items) {
                insertDetail.run(
                    eventData.event_id,
                    inst.start,
                    inst.end,
                    inst.continue === true ? 1 : (inst.continue === false ? 0 : null)
                );
            }
        });
        insertMany(instances);

        return { success: true };
    }
    /**
     * Deletes an entire event and all of its instances for a user.
     * @param {string} userId - The user's unique ID.
     * @param {string} eventId - ID of the event to delete.
     * @returns {Object} - Result indicating success.
     */
    deleteEvent(userId, eventId) {
        const db = this.getUserScheduleDB(userId);
        const deleteDetails = db.prepare(`DELETE FROM EVENT_DETAILS WHERE event_id = ?`);
        const deleteEvent = db.prepare(`DELETE FROM EVENT WHERE event_id = ?`);
        const tx = db.transaction(() => {
            deleteDetails.run(eventId);
            deleteEvent.run(eventId);
        });
        tx();
        return { success: true };
    }
    /**
     * Deletes a single instance of an event or the whole event if it's the only one.
     * @param {string} userId - The user's unique ID.
     * @param {string} eventId - ID of the event.
     * @param {string} startTime - ISO string of the instance start time.
     * @returns {Object} - Result indicating success.
     */
    deleteSingleInstanceSmart(userId, eventId, startTime) {
        const db = this.getUserScheduleDB(userId);

        const countStmt = db.prepare(`
            SELECT COUNT(*) as count FROM EVENT_DETAILS WHERE event_id = ?
        `);
        const { count } = countStmt.get(eventId);

        if (count <= 1) {
            return this.deleteEvent(userId, eventId);
        } else {
            return this.deleteSingleInstance(userId, eventId, startTime);
        }
    }
    /**
     * Deletes an instance and all future instances, or the entire event if applicable.
     * @param {string} userId - The user's unique ID.
     * @param {string} eventId - ID of the event.
     * @param {string} startTime - ISO string of the start time of deletion.
     * @returns {Object} - Result indicating success.
     */
    deleteFutureInstanceSmart(userId, eventId, startTime) {
        const db = this.getUserScheduleDB(userId);

        const futureCountStmt = db.prepare(`
            SELECT COUNT(*) as count FROM EVENT_DETAILS WHERE event_id = ? AND start >= ?
        `);
        const totalCountStmt = db.prepare(`
            SELECT COUNT(*) as count FROM EVENT_DETAILS WHERE event_id = ?
        `);

        const { count: futureCount } = futureCountStmt.get(eventId, startTime);
        const { count: totalCount } = totalCountStmt.get(eventId);

        if (futureCount === totalCount) {
            return this.deleteEvent(userId, eventId);
        } else {
            return this.deleteInstanceAndFuture(userId, eventId, startTime);
        }
    }

    /**
     * Deletes a specific instance of an event.
     * @param {string} userId - The user's unique ID.
     * @param {string} eventId - ID of the event.
     * @param {string} startTime - ISO start time of the instance to delete.
     * @returns {Object} - Result indicating success.
     */
    deleteSingleInstance(userId, eventId, startTime) {
        const db = this.getUserScheduleDB(userId);
        const deleteStmt = db.prepare(`
            DELETE FROM EVENT_DETAILS 
            WHERE event_id = ? AND start = ?
        `);
        deleteStmt.run(eventId, startTime);
        return { success: true };
    }
    /**
     * Deletes an event instance and all future ones from a given point in time.
     * @param {string} userId - The user's unique ID.
     * @param {string} eventId - ID of the event.
     * @param {string} startTime - ISO start time indicating where to start deletion.
     * @returns {Object} - Result indicating success.
     */
    deleteInstanceAndFuture(userId, eventId, startTime) {
        const db = this.getUserScheduleDB(userId);
        const deleteStmt = db.prepare(`
            DELETE FROM EVENT_DETAILS 
            WHERE event_id = ? AND start >= ?
        `);
        deleteStmt.run(eventId, startTime);
        return { success: true };
    }
    /**
     * Updates whether a particular instance should continue the repeating pattern.
     * @param {string} userId - The user's unique ID.
     * @param {string} eventId - ID of the event.
     * @param {string} startTime - ISO start time of the instance.
     * @param {boolean|null} shouldContinue - true to continue, false to stop, null to reset.
     * @returns {Object} - Result indicating success.
     */
    updateInstanceContinue(userId, eventId, startTime, shouldContinue) {
        const db = this.getUserScheduleDB(userId);
        const update = db.prepare(`
            UPDATE EVENT_DETAILS
            SET continue = ?
            WHERE event_id = ? AND start = ?
        `);
        update.run(shouldContinue === true ? 1 : (shouldContinue === false ? 0 : null), eventId, startTime);
        return { success: true };
    }
    /**
     * Retrieves upcoming events starting from a specific date.
     * Auto-generates more instances if needed.
     * @param {string} userId - The user's unique ID.
     * @param {string} fromDateISO - ISO string of the start date to query from.
     * @param {number} [maxInstances=10] - Max number of instances to return.
     * @returns {Array<Object>} - List of event instances.
     */
    getUpcomingEvents(userId, fromDateISO, maxInstances = 10) {
        const db = this.getUserScheduleDB(userId);
        if(db==null){
            return null;
        }

        const stmt = db.prepare(`
            SELECT 
                e.event_id, 
                e.title, 
                e.description, 
                e.repeat,
                d.start, 
                d.end, 
                d.continue
            FROM EVENT_DETAILS d
            JOIN EVENT e ON d.event_id = e.event_id
            WHERE d.end >= ?
            ORDER BY d.start ASC
            LIMIT ?
        `);

        const rows = stmt.all(fromDateISO, maxInstances);

        // Optionally: generate more instances if approaching limit of existing repeats
        const lastRow = rows[rows.length - 1];
        const eventsNeedingGeneration = new Set();

        if (lastRow && lastRow.repeat) {
            const repeat = JSON.parse(lastRow.repeat);
            if (repeat.until == null && lastRow.continue === 1) {
                eventsNeedingGeneration.add(lastRow.event_id);
            }
        }

        // Generate more if necessary
        for (const eventId of eventsNeedingGeneration) {
            this.generateNextYearChunk(userId, eventId);
        }

        // Re-query if more were generated
        if (eventsNeedingGeneration.size > 0) {
            return this.getUpcomingEvents(userId, fromDateISO, maxInstances);
        }

        return rows;
    }
    /**
     * Retrieves events that occur in a specific year and month.
     * @param {string} userId - The user's unique ID.
     * @param {number} year - Target year (e.g., 2025).
     * @param {number} month - Target month (1-12).
     * @returns {Array<Object>} - List of event instances for the month.
     */
    getEventsForMonth(userId, year, month) {
        const db = this.getUserScheduleDB(userId);

        // Format range: YYYY-MM-DD
        const from = new Date(Date.UTC(year, month - 1, 1)).toISOString();
        const to = new Date(Date.UTC(year, month, 1)).toISOString();

        const stmt = db.prepare(`
            SELECT e.event_id, e.title, e.description, e.repeat,
                d.start, d.end, d.continue
            FROM EVENT_DETAILS d
            JOIN EVENT e ON d.event_id = e.event_id
            WHERE d.start <= ? AND d.end >= ?
        `);
        const rows = stmt.all(to, from);

        // Check if we need to generate more instances for any indefinite events
        const futureDate = new Date(Date.UTC(year, month, 1));
        const eventsNeedingGeneration = new Set();

        for (const row of rows) {
            if (row.repeat) {
                const repeat = JSON.parse(row.repeat);
                if (repeat && !repeat.until) {
                    // Check if this is near the end of generated instances
                    const lastInstanceStmt = db.prepare(`
                        SELECT start, continue FROM EVENT_DETAILS 
                        WHERE event_id = ? 
                        ORDER BY start DESC 
                        LIMIT 1
                    `);
                    const lastInstance = lastInstanceStmt.get(row.event_id);
                    
                    if (lastInstance && lastInstance.continue === 1) {
                        const lastDate = parseISO(lastInstance.start);
                        const monthsUntilEnd = (lastDate.getTime() - futureDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
                        
                        // If we're within 3 months of the last generated instance, generate more
                        if (monthsUntilEnd < 3) {
                            eventsNeedingGeneration.add(row.event_id);
                        }
                    }
                }
            }
        }

        // Generate more instances if needed
        for (const eventId of eventsNeedingGeneration) {
            this.generateNextYearChunk(userId, eventId);
        }

        // Re-query if we generated new instances
        if (eventsNeedingGeneration.size > 0) {
            return stmt.all(from, to);
        }
        console.log(rows);
        return rows;
    }
}

module.exports = EventManager;