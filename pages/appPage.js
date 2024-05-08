/**
 * @class AppPage
 *
 * This is the container page for the main application.
 * There can be multiple app sub pages within.
 *
 */
"use strict";

import Page from "../resources/Page.js";

import ABApplicationList from "../../applications/applications.js";
import Shake from "shake.js";
import updater from "../resources/Updater.js";
import config from "../../config/config.js";
import appFeedback from "../resources/AppFeedback.js";

import NavMenu from "../../applications/navMenu/app.js";
const navMenu = new NavMenu();

import landingComponent from "./components/landingComponent.js";
import settingsComponent from "./components/settingsComponent.js";

const MAX_BACK_PRESSES = 3;
const WAIT_FOR_BUSY = 1000;

export class AppPage extends Page {
   /**
    */
   constructor() {
      super(
         "app-page",
         "lib/platform/pages/appPage.html",
         "lib/platform/pages/appPage.css"
      );

      // Are the AB Applications in the middle of being reset?
      // TODO (Guy): Refactor this in the future;
      this._currentRelayProgressBarTarget = null;
      this._initializeListener = false;
      this._pendingApplicationReset = false;
      this._relayJobsTotal = 0;
      this._relayJobsDone = 0;
      this.shakeEvent = null;
      this.application = null;
      this.applications = [];
      this.datacollections = [];
      this.updateOnLogin = true;
      this.f7App = null;
      this.components = {
         landingComponent,
         settingsComponent,
      };
      this.menuView = null;
      this.logView = null;
      this.appView = null;
      this.on("init.listener", () => {
         // handle back button clicks
         let backPresses = 0;
         window.addEventListener("load", () => {
            window.history.pushState({ noBackExitsApp: true }, "");
         });
         window.addEventListener("popstate", (event) => {
            if (event.state?.noBackExitsApp) {
               window.history.pushState({ noBackExitsApp: true }, "");
               return;
            }
            backPresses++;
            if (backPresses >= MAX_BACK_PRESSES) {
               window.history.back();
               return;
            }
            window.history.pushState({}, "");
         });
         window.addEventListener(
            "shake",
            () => {
               this.activateFeedback();
            },
            false
         );

         // Android hardware back button
         document.addEventListener(
            "backbutton",
            () => {
               this.appView.router.back();
            },
            false
         );
         this.AB.network.on("*", (message) => {
            if (this._currentRelayProgressBarTarget == null) return;
            this._relayObserver(message);
         });
         this.AB.network.on("offline", () => {
            // if we are interrupting a reset() sequence, warn the user:
            if (!this._pendingApplicationReset) return;
            this.f7App.dialog
               .alert(
                  "<t>Make sure you are connected to the Internet before trying to update your data.</t>",
                  "<t>No Network Connection</t>"
               )
               .open();
         });
         this.AB.network.on("online", async () => {
            // if we had an interrupted reset() sequence, try it again:
            if (!this._pendingApplicationReset) return;
            await this.forceApplicationReset();
         });
         this.AB.storage.on("ready", async () => {
            this.AB.busy.show("Checking an account.");
            try {
               await this.AB.account.init(this.AB, this.f7App);

               // Load account authToken
               if (this.AB.account.authToken == null) {
                  // Check the URL for magic link pre-token
                  const hash = String(document.location.hash);

                  // J.R.R. Token
                  const jrrMatch = hash.match(/JRR=(\w+)/);

                  // Remove tokens from current URL, for bookmarkability
                  window.history.replaceState(null, null, "#");

                  // No token in URL
                  if (jrrMatch == null) {
                     const err = new Error("No pre-token found");
                     err.code = "E_NOJRRTOKEN";
                     throw err;
                  } else {
                     // Import pre-token from the URL. Generate new authToken.
                     await this.AB.account.importCredentials(
                        jrrMatch[1],
                        hash.match(/tenant=(\w+)/)?.[1]
                     );
                  }
               }

               // Initialize the secure relay.
               // This relies on the account object from the previous step.
               await this.AB.network.init(this.AB);
               this.AB.analytics.info({
                  username: await this.AB.storage.get("uuid"),
               });
               await this._wait(WAIT_FOR_BUSY);
               this.AB.busy.hide();
            } catch (err) {
               // this.AB.analytics.logError(err);
               await this._wait(WAIT_FOR_BUSY);
               this.AB.busy.hide();
               await new Promise((resolve) => {
                  switch (err.code) {
                     case "E_BADAUTHTOKEN":
                     case "E_BADJRRTOKEN":
                        console.error(err);
                        this.AB.analytics.logError(err);
                        this.f7App.dialog
                           .alert(
                              "<t>Make sure you have scanned the correct QR code for your account. If the problem persists, please contact an admin for help.</t>",
                              "<t>Problem authenticating with server</t>",
                              () => {
                                 resolve();
                              }
                           )
                           .open();
                        break;

                     case "E_NOJRRTOKEN":
                        const resolveFunction = () => {
                           resolve();
                        };
                        resolveFunction()
                        break;

                     default:
                        console.error(err);
                        this.AB.analytics.logError(err);
                        // Some other problem with the server
                        this.f7App.dialog
                           .alert(
                              "<t>There is an unexpected problem with the server at this time.</t>",
                              "<t>Error</t>",
                              () => {
                                 resolve();
                              }
                           )
                           .open();
                        break;
                  }
               });
            }

            // TODO: Refactor later.
            this.AB.busy.show("Preparing components.");
            const routes = [
               this.components.landingComponent.route,
               this.components.settingsComponent.route,
               {
                  path: "/welcomePage/",
                  componentUrl:
                     "./lib/applications/welcomePage/templates/welcomeDisplay.html",
               },
               {
                  path: "/feedback/",
                  popup: {
                     componentUrl:
                        "./lib/applications/feedback/templates/feedback.html",
                  },
               },
               {
                  path: "/inbox/",
                  componentUrl: "./lib/applications/inbox/templates/list.html",
                  routes: [
                     {
                        path: "formio/:id/",
                        popup: {
                           componentUrl:
                              "./lib/applications/inbox/templates/formio.html",
                        },
                     },
                  ],
               },
               {
                  path: "/profile/",
                  componentUrl:
                     "./lib/applications/profile/templates/profile-landing.html",
                  routes: [
                     {
                        path: "details/:uuid",
                        popup: {
                           componentUrl:
                              "./lib/applications/profile/templates/profile-details.html",
                        },
                     },
                  ],
               },
            ];

            // Preparing components.
            try {
               await Promise.all([
                  this.components.landingComponent.init(this),
                  this.components.settingsComponent.init(this),
                  this.components.welcomeComponent.init(this),
               ]);
               if (this.AB.account.authToken == null)
                  throw new Error("Not found authToken.");

               // make sure our site user data has been properly
               // loaded. (1st load this needs to come from server call)
               if (this.AB.account.username == null)
                  await this.AB.account.fetchUserData();

               // TODO (Guy): Refactor these in the future.
               await Promise.all([
                  this.components.feedbackComponent.init(this),
                  this.components.inboxComponent.init(this),
                  this.components.profileComponent.init(this),
               ]);
               [
                  this.components.feedbackComponent,
                  this.components.inboxComponent,
                  this.components.profileComponent,
               ].forEach((dcComponent) => {
                  dcComponent.datacollections.forEach((dc) => {
                     if (
                        this.datacollections.find(
                           (existingDC) => existingDC.id === dc.id
                        ) == null
                     )
                        this.datacollections.push(dc);
                  });
               });

               // Initialize the AB applications
               const pendingInitializedApps = [];
               this.applications.forEach((app) => {
                  pendingInitializedApps.push(app.init(this));
                  routes.push(...app.routes.mainRoutes);
                  app.datacollections.forEach((dc) => {
                     if (
                        this.datacollections.find(
                           (existingDC) => existingDC.id === dc.id
                        ) == null
                     )
                        this.datacollections.push(dc);
                  });
               });
               pendingInitializedApps.forEach(async (pendingInitializedApp) => {
                  try {
                     await pendingInitializedApp;
                  } catch (err) {
                     console.error(
                        `Failed to initialize the app id: ${app.ID}`
                     );
                     console.error(err.message);
                     this.AB.analytics.logError(err);
                  }
               });
            } catch (err) {
               console.error(err);
               this.AB.analytics.logError(err);
            }
            await this._wait(WAIT_FOR_BUSY);
            this.AB.busy.hide();

            // Start up main Framework7 routing.
            // Requires app data to already be initialized.
            // on bootup, try to flush any network Queues
            this.AB.busy.show("Starting up main Framework7 routing");
            try {
               await this.AB.network.queueFlush();
            } catch (err) {
               this.AB.analytics.log(
                  'storage.emit("ready"): unable to flush Network Queue'
               );
               this.AB.analytics.logError(err);
            }
            await this._wait(WAIT_FOR_BUSY);
            this.AB.busy.hide();

            // Start listening for shake gesture
            if (config.platform.shakeGesture) this.shakeEvent.start();

            // Begin Framework7 router
            // Menu view
            this.menuView = this.f7App.views.create("#left-view", {
               url: "/nav/",
               routes: navMenu.routes,
            });
            this.appView = this.f7App.views.create("#main-view", {
               url: "/",
               routes,
            });
            appFeedback.init(this.appView.router);
         });
         this.f7App.on("pageInit popupOpen", (page) => {
            // Log Framework7 page views
            // if we cannot populate this we need let the app know we are hitting a dead end without an error
            let pageName = "unknown-page-name";
            // if this is a popup we need to look at the dom to get the title
            if (page.type === "popup") {
               const popUpElement = page.el.querySelector(".title");
               if (popUpElement == null) return;
               pageName = `/popup/${popUpElement.innerHTML
                  .toLowerCase()
                  .replace(" ", "-")}`;
            }
            // if this is a normal page we just grab the route path
            else if (page.route?.path != null) pageName = page.route.path;
            this.AB.analytics.pageView(pageName);
         });
         this._initializeListener = true;
      });
   }

   // Create the observer as an arrow function so `this` can be referenced
   _relayObserver(message) {
      const status = message?.verb;
      if (status != null && status !== "") {
         if (status == "added") {
            this._relayJobsTotal += 1;
         } else if (status === "done") {
            this._relayJobsDone += 1;
         } else if (status === "uninitialized") {
            this._relayJobsDone += 1;
         }
         var percentage = Math.round(
            (this._relayJobsDone / this._relayJobsTotal) * 100 || 0
         );
         this.f7App.progressbar.set(
            `#${this._currentRelayProgressBarTarget} .progressbar`,
            percentage,
            100
         );
      } else if (message) {
         // report of empty inbox can be sent here for some reason?
         // if we have a message, tell sentry we have a verbless message
         this.AB.analytics.logError(message);
      }
   }

   async _wait(miliSeconds) {
      await new Promise((resolve) => {
         setTimeout(() => {
            resolve();
         }, miliSeconds);
      });
   }

   async init(AB, appUUID) {
      await super.init(AB);
      this.application = this.AB.applicationByID(appUUID);

      // Can shake device to activate Feedback tool
      this.shakeEvent = new Shake({ threshold: 15 });

      // if this is null, don't crash the entire app:
      try {
         const updateOnLoginValue = localStorage.getItem("updateOnLogin");
         switch (updateOnLoginValue) {
            case "true":
               this.updateOnLogin = true;
               break;
            case "false":
               this.updateOnLogin = false;
               break;
            default:
               this.updateOnLogin = true;
               localStorage.setItem("updateOnLogin", "true");
               break;
         }
      } catch (e) {
         console.warn("WARNING localStorage not available!");
      }

      // Framework7 is the UI library
      this.f7App = new Framework7({
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

               account: this.AB.account,
               analytics: this.AB.analytics,
               busy: this.AB.busy,
               camera: this.AB.camera,
               network: this.AB.network,
               storage: this.AB.storage,
               updater,

               getComponent: (name) => {
                  return this.components[name];
               },

               // return the ABApplication matching the given .id
               getApplication: (id) => this.getApplicationByID(id),
            };
         },

         // Root DOM element for Framework7
         root: this.$element.get(0),
      });

      // Busy indicator needs access to .f7App
      this.AB.busy.setApp(this.f7App);

      // TODO (Guy): Refactor these in the future.
      this.applications = ABApplicationList.map((App) => new App());
      const feedbackComponent = this.applications.find(
         (app) => app.ID === "Feedback"
      );
      const inboxComponent = this.applications.find(
         (app) => app.ID === "INBOX"
      );
      const profileComponent = this.applications.find(
         (app) => app.ID === "PROFILE"
      );
      const welcomeComponent = this.applications.find(
         (app) => app.ID === "WELCOME"
      );
      this.applications = this.applications.filter((app) => {
         switch (app.ID) {
            case "Feedback":
            case "INBOX":
            case "PROFILE":
            case "WELCOME":
               return false;
            default:
               return true;
         }
      });

      // Component objects that will be referenced by F7 component code
      this.components.feedbackComponent = feedbackComponent;
      this.components.inboxComponent = inboxComponent;
      this.components.profileComponent = profileComponent;
      this.components.welcomeComponent = welcomeComponent;
      if (!this._initializeListener) this.emit("init.listener");
   }

   /**
    * update with a new user account
    *
    * we will be given the authToken and tenantUUID from the QR code
    * e.g. https://example.com/#JRR=058b3d5d8c9f33dc2545f2d5e804b4fd
    * -> authToken = 058b3d5d8c9f33dc2545f2d5e804b4fd,
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
   async updateAccount(authToken, tenantUUID) {
      // check both variables to be sure they are safe strings
      // check for sql symbols
      const sqlCheck = /['";]/;
      if (sqlCheck.test(authToken) || sqlCheck.test(tenantUUID)) {
         const err = new Error("Invalid authToken or tenantUUID");
         err.code = "E_BADAUTHTOKEN";
         throw err;
      }

      // No token in URL
      if (authToken == null) {
         const err = new Error("No pre-token found");
         err.code = "E_NOJRRTOKEN";
         throw err;
      } else {
         // Import pre-token from the URL. Generate new authToken.
         // importCredentials then refresh the page
         await this.AB.account.importCredentials(authToken, tenantUUID);
         // await this.fetchApplicationData(true);
      }
   }

   getApplicationByID(id) {
      // TODO (Guy): Refactor these in the future.
      for (const key in this.components)
         if (this.components[key].ID === id) return this.components[key];
      return this.applications.find((a) => {
         return a.ID === id;
      });
   }

   /**
    * Attach a progress bar to the target element.
    *
    */
   async buildRelayProgressBar(target = null) {
      //progressBar
      // use datacollections to get the total number of datacollections that will be relayed
      this._relayJobsTotal = this.datacollections.length || 0;
      this._relayJobsDone = 0;
      const tokens = await this.AB.network.getTokens();
      this._relayJobsTotal = Object.keys(tokens).length;

      // Put the Relay Loader inside the dialog
      const $progressbar = $(`#${target}`); // see templates/app.js

      // set progress-bar to display: block
      $progressbar.css("display", "block");
      this.f7App.progressbar.set(`#${target} .progressbar`, 0, 0);
      this._currentRelayProgressBarTarget = target;
      return $progressbar;
   }

   /**
    * @method fetchApplicationData()
    * Make sure all applications perform a remote data update before moving on.
    *
    * A modal dialog box will be displayed during the process.
    *
    * @param {boolean} [refreshPage]
    *      Refresh the page after completion?
    * @return {Promise}
    */
   async fetchApplicationData(refreshPage = false) {
      // Show message if it takes too long
      const warnUI = setTimeout(() => {
         this.f7App.toast
            .create({
               text: `<center><t data-cy="updateWarn" >Sorry, Data update is taking a long time...</t></center>`,
               position: "center",
            })
            .open();
         // analytics.log("warn (45 secs) during fetchApplicationData()");
      }, 45000);

      // Show message if it takes too long
      const waitToClose = setTimeout(() => {
         this.f7App.dialog
            .alert(
               "<t>Data update is taking a long time, there may have been a problem. Please try again later.</t>",
               "<t>Sorry</t>"
            )
            .open();
         this.AB.analytics.log(
            "Timeout (90 secs) during fetchApplicationData()"
         );
      }, 90000);

      // listen for when inits are complete
      clearTimeout(warnUI);
      clearTimeout(waitToClose);

      if (refreshPage) this.appView.router.refreshPage();
   }

   /**
    * @method fetchRecordData()
    * perform a specific remote data update before moving on.
    * a data collection
    *
    * @param {string} app
    * @param {string} datacollection
    */
   fetchRecordData(app, datacollection) {
      const targetDC = this.applications
         .find((a) => {
            return a.ID === app;
         })
         .datacollections.find((a) => {
            return a.name === datacollection;
            // TODO is this the right way to find the datacollection?
         });
      console.assert(
         targetDC,
         "appPage.fetchRecordData() could not find the datacollection"
      );
      return targetDC.reloadData();
   }

   /**
    * Reinitialize the AB Applications.
    * This is called after a new authToken is imported.
    *
    * @return {Promise}
    */
   async forceApplicationReset(includeLocal = false) {
      this._pendingApplicationReset = true;
      // TODO: Implement code to clear local code and get new code from the server
      // ex: the platform code, the ABApplication code, and the ABObject code
      //

      // TODO: Implement any additional logic or actions required after clearing and getting new code

      // Reset the cached application data
      console.log("::: forceApplicationReset(): Relay.init().");
      await this.AB.network.init(this);
      const allClears = [];
      const allResets = [];

      // tell all apps to .init() again
      this.applications.forEach((app) => {
         if (app.clearSystemData != null) allClears.push(app.clearSystemData());
         allResets.push(app.reset());
      });
      console.log("::: importSettings(): App.reset() x" + allResets.length);
      await Promise.all(allClears);
      await Promise.all(allResets);
      this.AB.analytics.event("forceApplicationReset Finished");
      console.log("::: forceApplicationReset Finished :::");
      this.f7App.panel.open("left");
      this.emit("resetComplete");

      // wipe the cache and hard reload
      if (includeLocal) updater.updateNow();
   }

   /**
    * Activate the feedback form
    */
   activateFeedback() {
      try {
         appFeedback.open();
      } catch (err) {
         console.log("Feedback error", err);
         this.f7App.dialog.alert(
            "<t>There was a problem sending feedback</t>",
            "<t>Sorry</t>"
         );
         appFeedback.close();
      }
   }
}

export default new AppPage();
