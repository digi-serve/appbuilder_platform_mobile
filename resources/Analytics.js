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
// import * as version from "../../../../version.js";
const VERSION = require("../../../../version.js");
console.log("Sentry.io plugin begin require/init");
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
      if (sentry) {
         try {
            console.log("Sentry.io plugin required, now init");
            sentry.init({
               dsn: process?.env?.SENTRY_DEV_DSN || config.sentryio.dsn, // "https://9df6fd4623934fadb4a9ee6bb6ec887f@sentry.io/1186956",
               debug: true,
               release: VERSION.version || null,
            });
            console.log("Sentry.io plugin initilized");
            this.sentry = sentry;
         } catch (err) {
            // Sentry.io plugin not installed
            console.log("Sentry.io plugin not installed");
            this.sentry = sentry;
         }
      }

      // Countly for everything else
      if (Countly) {
         Countly.q = Countly.q || [];
         // Track sessions automatically (recommended)
         Countly.q.push(["track_sessions"]);

         //track web page views automatically (recommended)
         Countly.q.push(["track_pageview"]);

         const features = ["sessions", "views", "crashes", "events"];
         try {
            Countly.init({
               url: config.countly.url,
               app_key: config.countly.appKey,
               debug: true,
            });
            // Countly.start();
            console.log("analytics init()");
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
      if (Countly) {
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
      var name = err.name || "Error";
      var data = {
         message: err.message || err._message || err,
      };
      if (err.stack) {
         data.stack = err.stack;
      }

      this.ready.then(() => {
         if (this.sentry) {
            this.sentry.captureException(err);
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
    * Log a text message to Sentry.
    * @param {String} message
    */
   log(message) {
      console.log(message);

      this.ready.then(() => {
         if (this.sentry) {
            this.sentry.captureMessage(message);
         }
      });
   }
}

var analytics = new Analytics();
export default analytics;
