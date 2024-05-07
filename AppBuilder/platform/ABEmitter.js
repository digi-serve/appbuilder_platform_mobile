/**
 * ABEmitter
 *
 * This is the platform dependent implementation of an Emitter object.
 *
 */

const EventEmitter = require("eventemitter2");
module.exports = class ABEmitter extends EventEmitter {
   constructor() {
      super({ maxListeners: 0 });
   }
};
