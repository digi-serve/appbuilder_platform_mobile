/**
 * ABQueueLock
 *
 * This is a singleton object that manages a set of Queues for our apps.
 *
 */

var Lock = require("../../resources/Lock.js");

var _queues = {};

class ABQueueLock {
    constructor() {
        this._queueLocks = _queues;
    }

    queueLock(key) {
        if (!this._queueLocks[key]) {
            this._queueLocks[key] = new Lock();
        }
        return this._queueLocks[key];
    }
}
// this is a singleton object.
module.exports = new ABQueueLock();
