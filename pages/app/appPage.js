/**
 * @class AppPage
 *
 * This is the container page for the main application.
 * There can be multiple app sub pages within.
 *
 */
"use strict";

import Page from "../../resources/Page.js";

import ABApplicationList from "../../../applications/applications";
import account from "../../resources/Account.js";
import analytics from "../../resources/Analytics.js";
import appFeedback from "../../resources/AppFeedback.js";
import Busy from "../../resources/Busy.js";
import camera from "../../resources/Camera.js";
import log from "../../resources/Log.js";
import Network from "../../resources/Network.js";
import notifications from "../../resources/Notifications.js";
import Shake from "shake.js";
import { storage, Storage } from "../../resources/Storage.js";
import updater from "../../resources/Updater.js";
import config from "../../../config/config.js";

// // import moment from 'moment';

import NavMenu from "../../../applications/navMenu/app.js";
const navMenu = new NavMenu();

import Logs from "../../../applications/Logs/app.js";
const Logger = new Logs();

import SettingsComponent from "../settings/settings.js";

export default class AppPage extends Page {
   /**
    */
   constructor() {
      super("opstool-app", "lib/platform/pages/app/app.html");

      // For console debugging only. Don't use these in the app like this.
      // window.appPage = this;
      // window.appPage.account = account;

      // Can shake device to activate Feedback tool
      this.shakeEvent = new Shake({ threshold: 15 });
      window.addEventListener(
         "shake",
         () => {
            this.activateFeedback();
         },
         false
      );

      this.storage = storage;
      this.templates = {};
      this.components = {};
      this.applications = ABApplicationList;
      this.dataReady = $.Deferred();
      this.routerReady = $.Deferred();

      var updateOnLogin = localStorage.getItem("updateOnLogin");
      if (updateOnLogin == "true") {
         this.updateOnLogin = true;
      } else if (updateOnLogin == "false") {
         this.updateOnLogin = false;
      } else {
         localStorage.setItem("updateOnLogin", "true");
         this.updateOnLogin = true;
      }

      // Framework7 is the UI library
      this.app = new Framework7({
         toast: {
            closeTimeout: 5000,
            position: "top",
         },
         statusbar: {
            iosOverlaysWebView: false,
            overlay: false,
         },
         // All of these will be available to F7 Components
         // under `this.$root.{name}`
         data: () => {
            return {
               appPage: this,

               account: account,
               analytics: analytics,
               busy: Busy,
               camera: camera,
               log: log,
               network: Network,
               storage: storage,
               updater: updater,

               getComponent: (name) => {
                  return this.components[name];
               },

               // Returns the mobile app, which is the application that
               // resides in the /lib/app/applications folder.
               // It is not the same thing as the ABApplication object.
               // It is not the same thing as the Framework7 app object.
               // It is also not the same thing as the actual Cordova
               // mobile app that this is all running in.
               // getMobileApp: (name) => {
               //     return this.applications.find((a) => {
               //         return a.id == name;
               //     });
               // },
               // return the ABApplication matching the given .id
               getApplication: (id) => {
                  var mApp = this.applications.find((a) => {
                     return a.ID == id || a.application.ID == id;
                  });
                  if (mApp) {
                     return mApp;
                  }
                  return null;
               },
            };
         },

         // Root DOM element for Framework7
         root: this.$element.get(0),
      });

      // Log function can use F7 to create alert dialogs
      log.init({ app: this.app });

      // Busy indicator needs access to .app
      Busy.setApp(this.app);

      // Component objects that will be referenced by F7 component code
      this.components["settings"] = new SettingsComponent(this.app);

      this.app.on("pageInit popupOpen", (page) => {
         // Log Framework7 page views
         // if we cannot populate this we need let the app know we are hitting a dead end without an error
         var pageName = "unknown-page-name";
         // if this is a popup we need to look at the dom to get the title
         if (page.type && page.type == "popup") {
            var popUpElement = page.el.querySelector(".title");
            if (popUpElement) {
               var popUp = popUpElement.innerHTML
                  .toLowerCase()
                  .replace(" ", "-");
               pageName = "/popup/" + popUp;
            }
         } else if (page.route && page.route.path) {
            // if this is a normal page we just grab the route path
            pageName = page.route.path;
         }
         analytics.pageView(pageName);
      });

      storage.on("ready", () => {
         this.prepareData();
      });
   }

   /**
    * Check to see if the user account is present.
    * 
    * First check device storage for the authToken, if not then scan the URL 
    * for magic link containing a pre-token.
    * e.g. https://example.com/#JRR=058b3d5d8c9f33dc2545f2d5e804b4fd
    * 
    * The pre-token is embedded in the hash fragment of the URL, which is never
    * transmitted to the webserver. (It is sent to the MCC server at a later
    * step.)
    * 
    * We will use the pre-token to register a new authToken for the user 
    * account.
    * 
    * @return {Promise}
    */
   checkAccount() {
      return account.getAuthToken()
         .then((authToken) => {
            // User account found on device
            if (authToken) return true;
            // Check the URL for magic link pre-token
            else {
               let hash = String(document.location.hash);
               // J.R.R. Token
               let jrrMatch = hash.match(/JRR=(\w+)/);
               // Tenant UUID
               let tenantMatch = hash.match(/tenant=(\w+)/) || {};
               // Remove tokens from current URL, for bookmarkability
               window.history.replaceState(null, null, "#");

               // No token in URL
               if (!jrrMatch) {
                  let err = new Error("No pre-token found");
                  err.code = "E_NOJRRTOKEN";
                  return Promise.reject(err);
               }
               // Import pre-token from the URL. Generate new authToken.
               else {
                  let preToken = jrrMatch[1];
                  let tenantUUID = tenantMatch[1];
                  return account.importCredentials(preToken, tenantUUID);
               }
            }
         })
   }

   /**
    * Load the locally stored data.
    */
   prepareData() {
      // Catch if the promise timed out without resolving or rejecting
      var timeout = setTimeout(() => {
         console.log("prepareData timed out");
         analytics.log(
            "appPage.prepareData() did not complete after 10 seconds"
         );
      }, 10000);

      account.init({ app: this.app })
         .then(() => {
            // Load account authToken
            return this.checkAccount();
         })
         .then(() => {
            // Load data from persistent storage into `this` object
            return Promise.all([
               // User ID
               this.loadData("uuid", null),
               this.components["settings"].dataReady,
            ]);
         })
         .then(() => {
            analytics.info({ username: this.uuid });

            // Initialize the secure relay.
            // This relies on the account object from the previous step.
            return Network.init();
         })
         .then(() => {
            // Are the AB Applications in the middle of being reset?
            this.pendingApplicationReset = false;
            Network.on("offline", () => {
               // if we are interrupting a reset() sequence, warn the user:
               if (this.pendingApplicationReset) {
                  this.closeRelayLoader();
                  this.app.dialog.alert(
                     "<t>Make sure you are connected to the Internet before trying to update your data.</t>",
                     "<t>No Network Connection</t>"
                  );
               }
            });
            Network.on("online", () => {
               // if we had an interrupted reset() sequence, try it again:
               if (this.pendingApplicationReset) {
                  this.forceApplicationReset();
               }
            });

            clearTimeout(timeout);
            this.dataReady.resolve();
         })
         .catch((err) => {
            clearTimeout(timeout);
            console.log(err);

            this.app.dialog.close();
            switch (err.code) {
               case "E_BADAUTHTOKEN":
               case "E_BADJRRTOKEN":
                  this.app.dialog.alert(
                     "<t>Make sure you have scanned the correct QR code for your account. If the problem persists, please contact an admin for help.</t>",
                     "<t>Problem authenticating with server</t>"
                  );
                  analytics.log("Token rejected by server: " + err.code);
                  break;

               case "E_NOJRRTOKEN":
                  this.app.dialog.alert(
                     "<t>To start using this app, you should have received a QR code. Use your phone's QR code camera app to scan it.</t>",
                     "<t>Welcome to conneXted!</t>"
                  );
                  analytics.log("App launched with no token");
                  break;

               default:
                  // Some other problem with the server
                  this.app.dialog.alert(
                     "<t>There is an unexpected problem with the server at this time.</t>",
                     "<t>Error</t>"
                  );
                  analytics.log("Error during AppPage.prepareData():");
                  analytics.log(err.message);
                  analytics.logError(err);
                  break;
            }
            this.dataReady.reject();
         });
   }

   /**
    * Initialize things that depend on the DOM
    */
   init() {
      this.dataReady.done(() => {
         this.begin();
      });
   }

   /**
    * Start up main Framework7 routing.
    * Requires app data to already be initialized.
    */
   begin() {
      // on bootup, try to flush any network Queues
      Network.queueFlush()
         .then(() => {
            console.log("appPage:begin(): Network Queue flushed.");
         })
         .catch((err) => {
            analytics.log("appPage:begin(): unable to flush Network Queue");
            analytics.logError(err);
         });

      // Start listening for shake gesture
      if (config.platform.shakeGesture) {
         this.shakeEvent.start();
      }

      // Initialize the AB applications
      this.applications.forEach((abApp) => {
         abApp.once("init.timeout", () => {
            analytics.log("ABApplication timed out during init(): " + abApp.id);
         });

         abApp.init(this).catch((err) => {
            console.log("Failed to init() ABApplication: " + abApp.id);
            console.log(err.message);
            console.log(err.stack);
            analytics.logError(err);
         });
      });


      // After QR code / deep link import, restart the AB Applications
      account.on("imported", (importState) => {
         if (importState.authToken == true) {
            this.forceApplicationReset();
         }
      });

      //// Begin Framework7 router

      // Menu view
      this.menuView = this.app.views.create("#left-view", {
         url: "/nav/",
         routes: navMenu.routes,
      });

      // Log view
      this.logView = this.app.views.create("#right-view", {
         url: "/log/",
         routes: Logger.routes,
      });

      // Main view
      var mainViewData = {
         url: "/",
         routes: [
            {
               // Root page
               path: "/",
               componentUrl:
                  "./lib/applications/landingPage/templates/landing.html",
            },
            {
               // Settings page
               path: "/settings/",
               componentUrl:
                  "./lib/applications/settings/templates/settings.html",
            },
         ],
      };
      this.applications.forEach((app) => {
         mainViewData.routes = mainViewData.routes.concat(app.routes);
      });
      this.appView = this.app.views.create("#main-view", mainViewData);
      appFeedback.init(this.appView.router);
      this.routerReady.resolve();

      // Android hardware back button
      document.addEventListener(
         "backbutton",
         () => {
            this.appView.router.back();
         },
         false
      );
   }


   /**
    * @method defaultRoute
    * return the route that should be considered the default route to open in.
    * @return {string}
    */
   defaultRoute() {
      var route = null;
      this.applications.forEach((app) => {
         if (app.isDefault) {
            route = app.defaultRoute();
         }
      });
      return route;
   }

   /**
    * Retrieve stored value from storage. By default, the value will be saved
    * into `this[key]`.
    *
    * @param {string} key
    * @param {anything} [defaultValue]
    *      Optional value to use if there was no stored value.
    * @param {function} [callback]
    *      Instead of `defaultValue` parameter, this callback function can be
    *      used to handle the stored value. `this[key]` will not be modified
    *      in this case.
    *
    * @return {Promise}
    */
   loadData(key, defaultValue) {
      return this.storage
         .get(key)
         .then((value) => {
            if (typeof defaultValue == "function") {
               var callback = defaultValue;
               callback(value);
            } else {
               this[key] = value || defaultValue;
            }

            return value;
         })
         .catch((err) => {
            console.log("Error reading from storage: " + key);
            analytics.logError(err);

            log.alert(
               "<t>There was a problem reading your data</t>",
               "<t>Sorry</t>"
            );
         });
   }

   /**
    * Save a value to storage.
    *
    * @param {string} key
    * @param {anything} [value]
    *      The value to save.
    *      By default, the value will be read from `this[key]`.
    * @return {Promise}
    */
   saveData(key, value = undefined) {
      if (arguments.length == 0) {
         // Save all user modifiable content
         return Promise.all([]);
      } else {
         if (value === undefined) {
            value = this[key];
         }
         return this.storage.set(key, value);
      }
   }

   /**
    * Display the relay progress dialog.
    *
    * @param {string} [title]
    */
   openRelayLoader(title = null) {
      this.relayJobsTotal = 0;
      this.relayJobsDone = 0;

      Promise.resolve()
         .then(() => {
            return Network.getTokens();
         })
         .then((tokens = {}) => {
            this.relayJobsTotal = Object.keys(tokens).length;
         });

      if (!this.relayLoaderDialog) {
         // Create F7 dialog
         this.relayLoaderDialog = this.app.dialog.create({
            closeByBackdropClick: false,
         });

         // Put the Relay Loader inside the dialog
         var $relayLoader = $("#relay-loader"); // see templates/app.js
         $(this.relayLoaderDialog.el)
            .find(".dialog-inner")
            .append($relayLoader);

         // Create the observer as an arrow function so `this` can be referenced
         this._relayObserver = (status) => {
            if (status == "added") {
               this.relayJobsTotal += 1;
            } else if (status == "done") {
               this.relayJobsDone += 1;
            }
            var percentage = Math.round(
               (this.relayJobsDone / this.relayJobsTotal) * 100 || 0
            );
            this.app.progressbar.set(
               "#relay-loader .progressbar",
               percentage,
               100
            );
         };
      }

      if (title) {
         this.relayLoaderDialog.setTitle(title);
      }
      this.relayLoaderDialog.open();
      this.app.progressbar.set("#relay-loader .progressbar", 0, 0);

      Network.on("job.*", this._relayObserver);
   }

   /**
    * Remove the relay progress dialog
    */
   closeRelayLoader() {
      if (this.relayLoaderDialog) {
         this.relayLoaderDialog.close();
      } else {
         console.log(
            "closeRelayLoader() called, but no .relayLoaderDialog  found."
         );
      }
      Network.off("job.*", this._relayObserver);
   }

   /**
    * @method fetchApplicationData()
    * Make sure all applications perform a remote data update before moving on.
    *
    * A modal dialog box will be displayed during the process.
    *
    * @param {Object} [options]
    * @param {boolean} [options.refreshPage]
    *      Refresh the page after completion?
    * @return {Promise}
    */
   fetchApplicationData(options = {}) {
      this.openRelayLoader("<t>Updating Data</t>");

      // Show message if it takes too long
      var waitToClose = setTimeout(() => {
         this.closeRelayLoader();
         this.app.dialog.alert(
            "<t>Data update is taking a long time, there may have been a problem. Please try again later.</t>",
            "<t>Sorry</t>"
         );
         analytics.log("Timeout (45 secs) during fetchApplicationData()");
      }, 45000);

      // track all the inits in progress:
      var allInits = [];

      // tell all apps to .init() again
      this.applications.forEach((abApp) => {
         allInits.push(abApp.initRemote(/* this */));
      });

      // listen for when inits are complete
      return Promise.all(allInits)
         .then(() => {
            clearTimeout(waitToClose);
            this.closeRelayLoader();

            if (options.refreshPage) {
               this.appView.router.refreshPage();
            }
         })
         .catch((err) => {
            this.closeRelayLoader();
            clearTimeout(waitToClose);
            console.log(err.message);
            console.log(err.stack);
            analytics.log("Error during fetchApplicationData()");
            throw err;
         });
   }

   /**
    * Reinitialize the AB Applications.
    * This is called after a new authToken is imported.
    *
    * @return {Promise}
    */
   forceApplicationReset() {
      this.openRelayLoader("<t>Connecting applications</t>");
      this.pendingApplicationReset = true;
      this.appResetOK = true;

      console.log("::: forceApplicationReset(): Relay.init().");
      return Network.init()
         .then(() => {
            var allClears = [];
            var allResets = [];

            // tell all apps to .init() again
            this.applications.forEach((abApp) => {
               if (abApp.clearSystemData) {
                  allClears.push(abApp.clearSystemData());
               }
               allResets.push(abApp.reset());
            });

            // tell all AB apps to .init() again:
            // this.applications.forEach((abApp) => {
            //     allInits.push(abApp.reset());
            // });
            console.log(
               "::: importSettings(): App.reset() x" + allResets.length
            );
            return Promise.all(allClears).then(() => {
               return Promise.all(allResets);
            });
         })
         .then(() => {
            this.pendingApplicationReset = false;
            this.closeRelayLoader();
            if (this.appResetOK) {
               analytics.event("QRInitFinished");
               console.log("::: QRInitFinished :::");
               this.app.panel.open("left");
               this.emit("resetComplete");
            }
         })
         .catch((err) => {
            this.closeRelayLoader();
            console.log("::: forceApplicationReset(): error");
            analytics.logError(err);
         });
   }

   /**
    * importCancel()
    * allows our applications to cancel the application reset process if they
    * detect an error.
    */
   importCancel() {
      this.closeRelayLoader();
      this.appResetOK = false;

      // Clear account credentials from device, since there was a problem
      // with them, apparently.
      // Question: could this result in a healthy account getting reset
      // because a query glitches out on the server?
      account.setAuthToken(null);
   }

   /**
    * Reload the current Framework7 page
    */
   reload() {
      this.appView.router.navigate(this.appView.router.currentRoute.path, {
         reloadCurrent: true,
         force: true,
         ignoreCache: true,
      });
   }

   /**
    * Activate the feedback form
    */
   activateFeedback() {
      try {
         appFeedback.open();
      } catch (err) {
         console.log("Feedback error", err);
         this.app.dialog.alert(
            "<t>There was a problem sending feedback</t>",
            "<t>Sorry</t>"
         );
         appFeedback.close();
      }
   }
}
