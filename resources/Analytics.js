/**
 * @class Analytics
 *
 * Manages the reporting to the Countly server
 *
 * Exports a singleton instance.
 */
"use strict";

import EventEmitter from "eventemitter2";
//import "./Countly.js"; // copied from Countly cordova plugin
let version;
try {
   version = VERSION;
   /* global VERSION */
   /* Version from package.json. Set by the DefinePlugin in webpack. */
} catch (err) {
   console.warn("VERSION variable not found");
}

// console.log("Sentry.io plugin begin require/init");
var sentry = require("@sentry/browser");
var Countly = require("countly-sdk-web");

var config = require("../../config/config.js");

class Analytics extends EventEmitter {
   // class Analytics {
   constructor() {
      super();
      this.username = null
      // this.sentry = sentry;
      this.ready = $.Deferred();
   }

   init() {
      // this.sentry = this.sentry || Sentry || null;
      // Sentry.io for crash reporting
      if (sentry && process.env.NODE_ENV == "production") {
         try {
            // console.log("Sentry.io plugin required, now init");
            sentry.init({
               dsn: config.sentryio.dsn, // "https://9df6fd4623934fadb4a9ee6bb6ec887f@sentry.io/1186956",
               debug: true,
               release: version,
            });
            // console.log("Sentry.io plugin initilized");
            this.sentry = sentry;
         } catch (err) {
            // Sentry.io plugin not installed
            console.warn("Sentry.io plugin not installed");
            this.sentry = sentry;
         }
      }
      const isIos = () => {
         return /iphone|ipad|ipod/.test(userAgent);
      };
      // detect if in chrome
      var chromeFlag = "non-ios";
      if (/crios/.test(userAgent)) {
         // set a logging flag for crios
         chromeFlag = "crios";
      } else {
         // Set a non-crios flag
         chromeFlag = "notcrios";
      }
      function getMemoryUsage() {
         const memoryInfo = performance.memory || {};
         return memoryInfo.usedJSHeapSize; // Memory used by JavaScript in bytes
      }
      function sendMessage(message) {
         // console.error("Analytics memory useage alert",message);
         // window.postMessage({ type: 'memoryAlert', message }, '*');
         analytics.logError(message);
      }
      const userAgent = window.navigator.userAgent.toLowerCase();
      const memoryThreshold = 450000000; // ios threshold in bytes
      const memoryPanic = 500000000; // ios threshold in bytes
      const monitoringInterval = 5000; // Example interval in milliseconds

      function monitorMemoryUsage() {
         const memoryUsage = getMemoryUsage();

         if (memoryUsage > memoryPanic) {
            const alertMessage = `Memory usage exceeded the ios threshold: ${memoryUsage} bytes in a ${chromeFlag} env`;
            let memoryError = new Error(alertMessage);
            console.log("Firing memory error message");
            analytics.logError(memoryError);
         } else if (memoryUsage > memoryThreshold) {
            const alertMessage = `Memory usage is high: ${memoryUsage} bytes in a ${chromeFlag} env`;
            let memoryError = new Error(alertMessage);
            console.log("Firing memory error message");
            analytics.logError(memoryError);
         }
      }
      // Set up the monitoring interval
      setInterval(monitorMemoryUsage, monitoringInterval);

      getMemoryUsage()

      // Countly for everything else
      if (Countly && process.env.NODE_ENV == "production") {
         Countly.q = Countly.q || [];
         // Track sessions automatically (recommended)
         Countly.q.push(["track_sessions"]);

         //track web page views automatically (recommended)
         Countly.q.push(["track_pageview"]);

         // const features = ["sessions", "views", "crashes", "events"];
         try {
            Countly.init({
               url: config.countly.url,
               app_key: config.countly.appKey,
               debug: true,
            });
            // Countly.start();
            // console.log("analytics init()");
            this.ready.resolve();
         } catch (err) {
            console.error("Analytics init error", err);
         }
      }
   }

   /**
    * Set information about the current user.
    *
    * Be careful about what you set here because it will be stored on
    * analytics servers which are outside the VPN.
    *
    * @param {Object} data
    *    {
    *       id: {String}, // for Sentry only
    *       name: {String},
    *       username: {String},
    *       email: {String},
    *       custom: {JSON} // for Countly only
    *    }
    */
   info(data) {
      data = data || {};
      this.ready.then(() => {
         if (Countly) {
            // Countly.setUserData(data);
            Countly.q.push(["userData.set", "data", data]); //set custom property
            Countly.q.push(["userData.save"]); 
         }

         if (this.sentry) {
            this.sentry.configureScope((scope) => {
               scope.setUser({
                  id: data.id || undefined,
                  email: data.email || undefined,
                  // abname: this.username || undefined, // this may be too sensitive
                  username: data.username || data.name || undefined, //|| undefined,
               });
            });
         }
      });
   }

   /**
    * Set the current user.
    *
    * @param {Object} data
    *       username: {String}
    */
   setUserName(data) {
      this.username = data;
   }

   /**
    * Record a page view.
    * @param {string} pageName
    */
   pageView(pageName) {
      if (Countly && process.env.NODE_ENV == "production") {
         Countly.q.push(["track_pageview", pageName]);
      }

      if (this.sentry) {
         this.sentry.addBreadcrumb({
            category: "page",
            message: pageName,
         });

         this.tag("page", pageName);
      }
   }

   /**
    * Set one or more tags in Sentry
    *
    * @param {string} key
    * @param {string} value
    *
    * OR
    *
    * @param {JSON} tags
    *      Multiple key-value pairs.
    */
   tag(key, value) {
      this.ready.then(() => {
         if (!this.sentry) return;

         var tags = {};

         // Single tag. key & value
         if (typeof key == "string") {
            tags[key] = value;
         }
         // Multiple tags passed in as JSON
         else if (typeof key == "object") {
            tags = key;
         }
         // Syntax error
         else {
            throw new SyntaxError("Wrong parameters for analytics.tag()");
         }

         this.sentry.configureScope((scope) => {
            for (var key in tags) {
               scope.setTag(key, tags[key]);
            }
         });
      });
   }

   /**
    * Record an event.
    * @param {string} name
    * @param {object} data
    */
   event(name, data) {
      data = data || {};
      if (Countly) {
         Countly.q.push([
            "add_event",
            {
               key: name,
               event: data,
            },
         ]);
      }

      if (this.sentry && !data.stack) {
         this.sentry.addBreadcrumb({
            category: "event",
            message: name,
         });
      }
   }

   /**
    * Log an error message.
    * @param {Error/String} err
    * @return {Object}
    *      {
    *          "name": {string},
    *          "message": {string}
    *      }
    */
   logError(err) {
      err = err || {};
      // if string or... other
      if (typeof err === "string" || typeof err != "object") {
         err = new Error(err);
      }
      // [object has no keys]
      if (Object.keys(err).length === 0) {
         console.dir(err)
         err = new Error("Empty error object");
      }
      var name = err.name || "Error";
      var data = {
         message: err.message || err._message || err,
      };
      if (err.stack) {
         data.stack = err.stack;
      }

      this.ready.then(() => {
         if (this.sentry && process.env.NODE_ENV == "production") {
            this.sentry.captureException(err);
         } else {
            // ?? 
            console.error(err);
         }

         // For Countly
         this.event(name, data);
      });

      return {
         name: name,
         message: data.message,
      };
   }
   /**
    * manage logging of an error which is important, but is often sent too often.
    * @param {Error/String} err
    * @return {Object}
    *      {
    *          "name": {string},
    *          "message": {string}
    *      }
    */
   manageManyError(err) {
      // TODO: Implement this
   }

   /**
    * Log a text message to Sentry.
    * @param {String} message
    */
   log(message) {
      
      this.ready.then(() => {
         if (this.sentry && process.env.NODE_ENV == "production") {
            this.sentry.captureMessage(message);
         }
      });
   }
}

var analytics = new Analytics();
export default analytics;
