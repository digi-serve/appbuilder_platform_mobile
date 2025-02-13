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
         "lib/platform/pages/appPage.css",
      );

      // Are the AB Applications in the middle of being reset?
      // TODO (Guy): Refactor this in the future;
      this._isUpdating = false;
      this._pendingReset = false;
      this._updatingCallbacks = [];
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
      this.excludeDataCollections = [
         "Family Worker Information",
         "powerUserReports",
         "powerUserItems",
         "powerUserRCs",
         "powerUserPRJs",
      ];
      this.f7App = null;
      this.menuView = null;
      this.on("ready", async (callback) => {
         const app = this.app;
         const resources = app.resources;
         const analytics = resources.analytics;
         const busy = resources.busy;
         const network = resources.network;
         const f7App = this.f7App;
         const dialog = f7App.dialog;
         let isAuth = false;
         busy.show("Checking an account.");
         try {
            // Load authToken
            let existingToken = await network.hasAuthToken();
            if (existingToken != null) {
               await network.importCredentials();
            } else if (location?.hash) {
               console.log(location.hash);
               // Import pre-token from the URL. Generate new authToken.
               // Parse J.R.R. Token and tenant from URL;
               const hash = String(location.hash);
               busy.hide();
               busy.show("Logging in...");
               await network.importCredentials(
                  hash.match(/JRR=(\w+)/)?.[1],
                  hash.match(/tenant=(\w+)/)?.[1],
               );
            } else {
               throw new Error({code: "E_NOJRRTOKEN"})
            }

            // Remove tokens from current URL, for bookmarkability
            history.replaceState(null, null, "#");
            isAuth = true;
            busy.hide();
         } catch (err) {
            busy.hide();
            await new Promise((resolve) => {
               switch (err.code) {
                  case "E_NOJRRTOKEN":
                     dialog
                        .alert(
                           "<t>Please re-scan the QR code from inside this app. iOS does not allow homescreen apps to recive data from Safari.</t>",
                           "<t>Be ready to scan QR</t>",
                           function () {
                              resolve();
                           },
                        )
                        .open();
                     break;
                  case "E_BADAUTHTOKEN":
                     dialog
                        .alert(
                           "<t>Make sure you have scanned the correct QR code for your account. If the problem persists, please contact an admin for help.</t>",
                           "<t>Problem authenticating with server</t>",
                           () => {
                              resolve();
                           },
                        )
                        .open();
                     break;
                  default:
                     console.error(err);
                     analytics.logError(err);
                     dialog
                        .alert(`<t>${err.message}</t>`, "<t>Error</t>", () => {
                           resolve();
                        })
                        .open();
                     break;
               }
            });
         }

         // Preparing components.
         busy.show("Preparing components.");
         const mainRoutes = [];
         const menuRoutes = [];
         let resolveInit = null;
         try {
            // components isn't fully iterable, so we need to use a for loop.
            const components = this.components;
            const pendingPromises = [];
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
            await Promise.all(
               app.applications.map((app) => {
                  const routes = app.routes;
                  if (routes.mainRoutes != null)
                     mainRoutes.push(...routes.mainRoutes);
                  if (routes.menuRoutes != null)
                     menuRoutes.push(...routes.menuRoutes);
                  return app.init(this);
               }),
            );
            if (isAuth) {
               // This relies on the account object from the previous step.
               const account = resources.account;
               const inboxComponent = components.inbox;
               await account.loadUserData();
               if (account.userData?.user != null)
                  await inboxComponent.loadInboxData();
               else {
                  await account.loadUserData(true);
                  if (account.userData?.user != null)
                     await inboxComponent.loadInboxData(true);
                  else throw new Error("Not found an user.");
               }
               const isPowerUser = account.isPowerUser;
               if (isPowerUser) {
                  this.excludeDataCollections = [
                     "Family Worker Information",
                     "My Team RCs - Mobile", 
                     "Project",
                     // TODO update the UI to not use these anymore
                     // "Report Items Tab",
                     // "Expense Report - Mobile",
                     // TODO enable these after adjusting the UI to use them
                     // "powerUserReports",
                     // "powerUserItems",
                  ];
               } else {
                  // default user
                  this.excludeDataCollections = [
                     "Family Worker Information",
                     "powerUserReports",
                     "powerUserItems",
                     "powerUserRCs",
                     "powerUserPRJs",
                  ];
               }
               (async () => {
                  const abDCs = app.abDCs;
                  const data = {
                     doneAmount: 0,
                     length: abDCs.length,
                     status: "init.dc",
                  };
                  const dcErrors = [];
                  await new Promise((resolve) => {
                     resolveInit = resolve;
                  });
                  const waitForNexStepSecs = TIME_DATA_UPDATE / 2;
                  await this._waitInMiliSecs(waitForNexStepSecs);
                  await Promise.all(
                     abDCs.map((dc) =>
                        (async () => {
                           if (!this.excludeDataCollections.includes(dc.name)) {
                              try {
                                 await dc.init();
                                 await dc.loadData();
                              } catch (err) {
                                 console.error(err);
                                 analytics.logError(err);
                                 dcErrors.push(err);
                              }
                           }
                           data.doneAmount++;
                           await this.updateSyncUI(["component.nav"], data);
                        })(),
                     ),
                  );
                  await this._waitInMiliSecs(waitForNexStepSecs);
                  await this.updateSyncUI();
                  for (const dcError of dcErrors)
                     await new Promise((resolve) => {
                        dialog
                           .alert(
                              `<t>${dcError.message}</t>`,
                              "<t>Error</t>",
                              () => {
                                 resolve();
                              },
                           )
                           .open();
                     });
                  this._checkForUpdate(true);
               })();
            }
         } catch (err) {
            console.error(err);
            analytics.logError(err);
            busy.hide();
            await new Promise((resolve) => {
               dialog
                  .alert(`<t>${err.message}</t>`, "<t>Error</t>", () => {
                     resolve();
                  })
                  .open();
            });
         }
         busy.show("Starting up main Framework7 routing");
         try {
            // Start up main Framework7 routing.
            // Requires app data to already be initialized.
            // on bootup, try to flush any network Queues
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
            if (callback != null) {
               const callbackResult = callback();
               if (callbackResult instanceof Promise) await callbackResult;
            }
            busy.hide();
         } catch (err) {
            console.error(err);
            busy.hide();
            await new Promise((resolve) => {
               dialog
                  .alert(`<t>${err.message}</t>`, "<t>Error</t>", () => {
                     resolve();
                  })
                  .open();
            });
         }
         resolveInit != null && resolveInit();
      });
   }

   _checkForUpdate(isUpdating) {
      if (isUpdating !== this._isUpdating) this._isUpdating = isUpdating;
      if (!this._isUpdating) return;
      const app = this.app;
      const resources = app.resources;
      const analytics = resources.analytics;
      const dialog = this.f7App.dialog;
      const excludeDataCollections = this.excludeDataCollections;
      setTimeout(async () => {
         await Promise.all(
            [
               (async () => {
                  try {
                     await resources.account.loadUserData(true);
                  } catch (err) {
                     console.error(err);
                     analytics.logError(err);
                     await new Promise((resolve) => {
                        dialog
                           .alert(
                              `<t>${err.message}</t>`,
                              "<t>Error</t>",
                              () => {
                                 resolve();
                              },
                           )
                           .open();
                     });
                  }
               })(),
               (async () => {
                  try {
                     await this.components.inbox.loadInboxData(true);
                  } catch (err) {
                     console.error(err);
                     analytics.logError(err);
                     await new Promise((resolve) => {
                        dialog
                           .alert(
                              `<t>${err.message}</t>`,
                              "<t>Error</t>",
                              () => {
                                 resolve();
                              },
                           )
                           .open();
                     });
                  }
               })(),
            ].concat(
               app.abDCs.map(async (abDC) => {
                  // Don't load excluded DCs
                  if (excludeDataCollections.includes(abDC.name)) return;
                  try {
                     await abDC.updateSyncData();
                  } catch (err) {
                     console.error(err);
                     analytics.logError(err);
                     await new Promise((resolve) => {
                        dialog
                           .alert(
                              `<t>${err.message}</t>`,
                              "<t>Error</t>",
                              () => {
                                 resolve();
                              },
                           )
                           .open();
                     });
                  }
               }),
            ),
         );
         try {
            await this.updateSyncUI();
         } catch (err) {
            console.error(err);
            analytics.logError(err);
            await new Promise((resolve) => {
               dialog
                  .alert(`<t>${err.message}</t>`, "<t>Error</t>", () => {
                     resolve();
                  })
                  .open();
            });
         }
         console.log("Check for update!!!!!!!!!!!!!!!!!!!!");
         this._checkForUpdate(this._isUpdating);
      }, TIME_DATA_UPDATE);
   }

   async _waitInMiliSecs(miliSecs) {
      await new Promise((resolve) => {
         setTimeout(() => {
            resolve();
         }, miliSecs);
      });
   }

   async init(app) {
      await super.init(app);

      // If testing, disable this as it disrupts Cypress
      const MCC_URL = process.env.MCC_URL;
      if (MCC_URL != "http://localhost:83"){
         document.addEventListener("backbutton", onBackKeyDown, false);
         window.addEventListener("beforeunload", onBackKeyDown, false);
      }
      function onBackKeyDown(e) {
         e.preventDefault();

         app.toast
            ?.create({
               text: "Do you want to exit?",
               closeButton: true,
               closeButtonText: "Exit",
               closeButtonColor: "lime",
               on: {
                  closeButtonClick: function () {
                     navigator.app.exitApp();
                     e.preventDefault();
                  },
               },
            })
            .open();
      }

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

   setUpdatingCallback(key, callback) {
      const updatingCallbacks = this._updatingCallbacks;
      const updatingCallback = updatingCallbacks.find((e) => e.key === key);
      if (updatingCallback == null) {
         updatingCallbacks.push({
            key,
            callback,
         });
         return;
      }
      updatingCallback.callback = callback;
   }

   removeUpdatingCallback(key) {
      const updatingCallbacks = this._updatingCallbacks;
      updatingCallbacks.splice(
         updatingCallbacks.findIndex(
            (updatingCallback) => updatingCallback.key === key,
         ),
         1,
      );
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

      // No token in URL
      if (!preToken || !tenantUUID || preToken == null) {
         const err = new Error("No pre-token found");
         err.code = "E_NOJRRTOKEN";
         throw err;
      }
      const sqlCheck = /['";]/;
      if (sqlCheck.test(preToken) || sqlCheck.test(tenantUUID)) {
         const err = new Error("Invalid authToken or tenantUUID");
         err.code = "E_BADAUTHTOKEN";
         throw err;
      }
      // Import pre-token from the URL. Generate new authToken.
      // importCredentials then refresh the page
      const resources = this.app.resources;
      await resources.network.importCredentials(preToken, tenantUUID);
      await resources.account.loadUserData(true);
   }

   async updateSyncUI(keys, data) {
      const updatingCallbacks = this._updatingCallbacks;
      await Promise.all(
         (
            (keys == null && updatingCallbacks) ||
            updatingCallbacks.filter((e) => keys.includes(e.key))
         ).map(async (e) => {
            const callbackResult = e.callback(data);
            if (callbackResult instanceof Promise) await callbackResult;
         }),
      );
   }

   getApplicationByID(id) {
      return this.app.applications.find((app) => {
         return app.id === id;
      });
   }

   getDatacollectionByID(id) {
      return this.app.abDCs.find((d) => d.id == id || d.name == id);
   }

   dataCollection(key) {
      return this.getDatacollectionByID(key);
   }

   /**
    * Reinitialize the AB Applications.
    * This is called after a new authToken is imported.
    *
    * @return {Promise}
    */
   async reset(force = false) {
      try {
         this._pendingReset = true;
         // TODO: Implement code to clear local code and get new code from the server
         // ex: the platform code, the ABApplication code, and the ABObject code
         //

         // TODO: Implement any additional logic or actions required after clearing and getting new code

         // Reset the cached application data
         const app = this.app;
         await app.resources.network.reset(force);
         await Promise.all(
            app.applications.map((application) => application.reset(force)),
         );
         this.f7App.panel.open("left");
         this._pendingReset = false;
      } catch (err) {
         // wipe the cache and hard reload
         this._pendingReset = false;
         throw err;
      }
   }

   get isUpdating() {
      return this._isUpdating;
   }
}

export default new AppPage();
