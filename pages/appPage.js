/**
 * @class AppPage
 *
 * This is the container page for the main application.
 * There can be multiple app sub pages within.
 *
 */
"use strict";

import Common from "./classes/Common.js";

// Components
import feedback from "./components/feedback.js";
import inbox from "./components/inbox.js";
import landing from "./components/landing.js";
import nav from "./components/nav.js";
import profile from "./components/profile.js";
import settings from "./components/settings.js";
import welcome from "./components/welcome.js";

const TIME_DATA_UPDATE = 1000;
class AppPage extends Common {
   constructor() {
      super(
         "app-page",
         "lib/platform/pages/appPage.html",
         "lib/platform/pages/appPage.css"
      );

      // Are the AB Applications in the middle of being reset?
      // TODO (Guy): Refactor this in the future;
      this._isUpdating = false;
      this._pendingApplicationReset = false;
      this.appView = null;
      this.components = {
         feedback,
         inbox,
         landing,
         nav,
         profile,
         settings,
         welcome,
      };
      this.f7App = null;
      this.menuView = null;
      this.on("ready", async (callback) => {
         const app = this.app;
         const resources = app.resources;
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

            await account.loadUserData();
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
         const mainRoutes = [
            // TODO (Guy): Refactor.
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
         const menuRoutes = [];
         try {
            const components = this.components;
            let pendingPromises = [];
            try {
               // components isn't fully iterable, so we need to use a for loop.
               for (const key in components) {
                  if (Object.hasOwnProperty.call(components, key)) {
                     pendingPromises.push(components[key].init(this));
                     const routes = components[key].routes;
                     if (routes.mainRoutes != null)
                        mainRoutes.push(...routes.mainRoutes);
                     if (routes.menuRoutes != null)
                        menuRoutes.push(...routes.menuRoutes);
                  }
               }
               await Promise.all(pendingPromises);
            } catch (err) {
               console.error("appPage.js: Error trying to init routes: ", err);
            }
            pendingPromises = [];
            app.applications.forEach((app) => {
               pendingPromises.push(app.init(this));
               const routes = app.routes;
               if (routes.mainRoutes != null)
                  mainRoutes.push(...routes.mainRoutes);
               if (routes.menuRoutes != null)
                  menuRoutes.push(...routes.menuRoutes);
            });

            // This relies on the account object from the previous step.
            if (account.userData?.user.username == null)
               throw new Error("Not found an user.");
            (async () => {
               await Promise.all(
                  app.abDCs.map((dc) =>
                     (async () => {
                        //    try {
                           console.error('arst');
                           await dc.init();
                           await dc.loadData();
                        // } catch (err) {
                        // }
                     })()
                  )
               );
               await Promise.all(
                  pendingPromises.map(async (pendingPromise) => {
                     try {
                        await pendingPromise;
                     } catch (err) {
                        console.error(err);
                     }
                  })
               );
               pendingPromises = null;
               this._checkForUpdate(true);
            })();
         } catch (err) {
            console.error(err);
         }
         busy.hide();
         try {
            // Start up main Framework7 routing.
            // Requires app data to already be initialized.
            // on bootup, try to flush any network Queues
            busy.show("Starting up main Framework7 routing");
            await network.queueFlush();

            // Begin Framework7 router
            // Menu view
            const f7AppViews = f7App.views;
            this.appView = f7AppViews.create("#main-view", {
               url: "/",
               routes: mainRoutes,
            });
            this.menuView = f7AppViews.create("#left-view", {
               url: "/nav/",
               routes: menuRoutes,
            });
            busy.hide();
            if (callback == null) return;
            const callbackResult = callback();
            if (callbackResult instanceof Promise) await callbackResult;
         } catch (err) {
            console.error(err);
         }
      });
   }

   _checkForUpdate(isUpdating) {
      if (isUpdating !== this._isUpdating) this._isUpdating = isUpdating;
      if (!this._isUpdating) return;
      const app = this.app;
      setTimeout(async () => {
         await Promise.all(
            [
               (async () => {
                  try {
                     await app.resources.account.loadUserData(true);
                  } catch (err) {
                     console.error(err);
                  }
               })(),
            ].concat(
               app.abDCs.map(async (abDC) => {
                  try {
                     await abDC.updateSyncData();
                  } catch (err) {
                     console.error(err);
                  }
               })
            )
         );

         // TODO:
         // loadProfileData() is no longer a thing?  How do we initialize the
         // Profile Display?
         this.components.profile.loadProfileData();
         console.log("Check for update!!!!!!!!!!!!!!!!!!!!");
         this._checkForUpdate(this._isUpdating);
      }, TIME_DATA_UPDATE);
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
      await resources.account.loadUserData();
      // await this.fetchApplicationData(true);
   }

   getApplicationByID(id) {
      return this.app.applications.find((app) => {
         return app.id === id;
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
      const targetDC = this.app.applications
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
      const app = this.app;
      await app.resources.network.init(this.app);
      const allClears = [];
      const allResets = [];

      // tell all apps to .init() again
      app.applications.forEach((app) => {
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
