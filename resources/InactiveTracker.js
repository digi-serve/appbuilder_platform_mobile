/**
 * @class InactiveTracker
 *
 * determine whether user has been inactive for a specified amount of time.
 * https://www.npmjs.com/package/user-inactivity-tracker
 */

// import EventEmitter from "eventemitter2";

class InactiveTracker {
   constructor(/*timeout, callback*/) {
      // super();
      this.app = null;
      this._timeout = 90000; //timeout;
      this._callback = null; //callback;
      this._inactivityTimer = null;
      this._events = ["mousemove", "keydown", "scroll", "touchstart"];
   }

   init(app) {
      this.app = app;
      // this._inactivityTimer = 300;
   }

   setCallback(callback) {
      this._callback = callback;
   }

   resetTimer() {
      clearTimeout(this._inactivityTimer);
      this._inactivityTimer = setTimeout(this._callback, this._timeout);
   }

   startTracking() {
      this._events.forEach((event) => {
         window.addEventListener(event, this.resetTimer.bind(this));
      });
      this.resetTimer();
   }

   stopTracking() {
      this._events.forEach((event) => {
         window.removeEventListener(event, this.resetTimer.bind(this));
      });
      clearTimeout(this._inactivityTimer);
   }
}

export default new InactiveTracker();
