/**
 * @class AppPage
 *
 * This is the container page for the main application.
 * There can be multiple app sub pages within.
 *
 */
"use strict";

import Common from "./classes/Common.js";

import ABApplicationList from "../../applications/applications.js";
// import appFeedback from "../resources/AppFeedback.js";

import inbox from "./components/inbox.js";
import landing from "./components/landing.js";
import navMenu from "../../applications/navMenu/app.js";
import settings from "./components/settings.js";
import welcome from "./components/welcome.js";

class AppPage extends Common {
   constructor() {
      super(
         "app-page",
         "lib/platform/pages/appPage.html",
         "lib/platform/pages/appPage.css"
      );

      // Are the AB Applications in the middle of being reset?
      // TODO (Guy): Refactor this in the future;
      this._pendingApplicationReset = false;
      this.applications = [];
      this.appView = null;
      this.components = {
         inbox,
         landing,
         navMenu: new navMenu(),
         settings,
         welcome,
      };
      this.f7App = null;
      this.menuView = null;
      this.on("ready", async () => {
         const resources = this.app.resources;
         const account = resources.account;
         const busy = resources.busy;
         const network = resources.network;
         const f7App = this.f7App;
         busy.show("Checking an account.");
         try {
            // Load authToken
            // Import pre-token from the URL. Generate new authToken.
            // Parse J.R.R. Token and tenant from URL;
            const hash = String(document.location.hash);
            await network.importCredentials(
               hash.match(/JRR=(\w+)/)?.[1],
               hash.match(/tenant=(\w+)/)?.[1]
            );

            // Remove tokens from current URL, for bookmarkability
            history.replaceState(null, null, "#");

            await account.fetchUserData();
            busy.hide();
         } catch (err) {
            console.error(err);
            busy.hide();
            await new Promise((resolve) => {
               const dialog = f7App.dialog;
               switch (err.code) {
                  case "E_NOJRRTOKEN":
                  case "E_BADAUTHTOKEN":
                     dialog
                        .alert(
                           "<t>Make sure you have scanned the correct QR code for your account. If the problem persists, please contact an admin for help.</t>",
                           "<t>Problem authenticating with server</t>",
                           () => {
                              resolve();
                           }
                        )
                        .open();
                     break;
                  default:
                     // Some other problem with the server
                     dialog
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

         // TODO (Guy): Refactor later.
         // Preparing components.
         busy.show("Preparing components.");
         const components = this.components;
         const routes = [
            components.inbox.route,
            components.landing.route,
            // TODO (Guy): Refactor later.
            ...components.navMenu.routes,
            components.settings.route,
            components.welcome.route,
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
         try {
            await Promise.all([
               components.inbox.init(this),
               components.landing.init(this),
               components.navMenu.init(this),
               components.settings.init(this),
               components.welcome.init(this),
            ]);

            // This relies on the account object from the previous step.
            if (account.username == null) throw new Error("Not found an user.");

            // TODO (Guy): Refactor these in the future.
            await Promise.all([
               components.profile.init(this),
            ]);

            // Initialize the AB applications
            const pendingInitializedApps = [];
            this.applications.forEach((app) => {
               pendingInitializedApps.push(app.init(this));
               routes.push(...app.routes.mainRoutes);
            });
            pendingInitializedApps.forEach(async (pendingInitializedApp) => {
               try {
                  await pendingInitializedApp;
               } catch (err) {
                  console.error(err);
               }
            });
         } catch (err) {
            console.error(err);
         }
         busy.hide();

         // Start up main Framework7 routing.
         // Requires app data to already be initialized.
         // on bootup, try to flush any network Queues
         busy.show("Starting up main Framework7 routing");
         try {
            await network.queueFlush();
         } catch (err) {
            console.error(err);
         }

         // Begin Framework7 router
         // Menu view
         const f7AppViews = f7App.views;
         this.menuView = f7AppViews.create("#left-view", {
            url: "/nav/",
            routes: components.navMenu.routes,
         });
         const appView = f7AppViews.create("#main-view", {
            url: "/",
            routes: routes,
         });

         // TODO (Guy): Refactor this later.
         // appFeedback.init(appView.router);
         this.appView = appView;
         busy.hide();
      });
   }

   async init(app) {
      await super.init(app);

      // Framework7 is the UI library
      this.f7App ||
         (this.f7App = new Framework7({
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
            data: () => ({
               app: this.app,
            }),

            // Root DOM element for Framework7
            root: this.$element.get(0),
         })).on("pageInit popupOpen", (page) => {
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
            this.app.resources.analytics.pageView(pageName);
         });

      // TODO (Guy): Refactor these in the future.
      let applications = ABApplicationList.map((App) => new App());
      const profile = applications.find((app) => app.ID === "PROFILE");
      applications = applications.filter((app) => {
         switch (app.ID) {
            case "PROFILE":
               return false;
            default:
               return true;
         }
      });
      this.applications = applications;

      // Component objects that will be referenced by F7 component code
      const components = this.components;
      // components.feedback = feedback;
      components.profile = profile;
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
   async updateAccount(preToken, tenantUUID) {
      // check both variables to be sure they are safe strings
      // check for sql symbols
      const sqlCheck = /['";]/;
      if (sqlCheck.test(preToken) || sqlCheck.test(tenantUUID)) {
         const err = new Error("Invalid authToken or tenantUUID");
         err.code = "E_BADAUTHTOKEN";
         throw err;
      }

      // No token in URL
      if (preToken == null) {
         const err = new Error("No pre-token found");
         err.code = "E_NOJRRTOKEN";
         throw err;
      }
      // Import pre-token from the URL. Generate new authToken.
      // importCredentials then refresh the page
      const resources = this.app.resources;
      await resources.network.importCredentials(preToken, tenantUUID);
      await resources.account.fetchUserData();
      // await this.fetchApplicationData(true);
   }

   getApplicationByID(id) {
      // TODO (Guy): Refactor these in the future.
      const components = this.components;
      for (const key in components)
         if (components[key].ID === id) return components[key];
      return this.applications.find((app) => {
         return app.ID === id;
      });
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
      await this.app.resources.network.init(this.app);
      const allClears = [];
      const allResets = [];

      // tell all apps to .init() again
      this.applications.forEach((app) => {
         if (app.clearSystemData != null) allClears.push(app.clearSystemData());
         allResets.push(app.reset());
      });
      await Promise.all(allClears);
      await Promise.all(allResets);
      this.f7App.panel.open("left");

      // wipe the cache and hard reload
      this._pendingApplicationReset = false;
   }
}

export default new AppPage();
