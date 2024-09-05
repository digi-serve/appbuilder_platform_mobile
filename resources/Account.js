/**
 * @class Account
 *
 * Manages the user's account credentials on the device
 *
 * Exports a singleton instance.
 */
"use strict";

import EventEmitter from "eventemitter2";

const EVENT_KEY_LOAD_USER_DATA = "loadUserData";
const EVENT_PATH = "resources.account";
const TIME_WAIT_FOR_USER_DATA = 1000;
class Account extends EventEmitter {
   constructor() {
      super();
      this._lock = null;
      this._pendingNetworkCallbacks = {
         loadUserData: null,
      };
      this._userData = null;
      this.app = null;
      this.on(EVENT_KEY_LOAD_USER_DATA, async (context, res) => {
         const pendingNetworkCallbacks = this._pendingNetworkCallbacks;
         const callback = pendingNetworkCallbacks[EVENT_KEY_LOAD_USER_DATA];

         // This is in case we reload and still receive a job response from MCC.
         const isError = res.status === "error";
         const data = res.data;
         if (callback == null) {
            const app = this.app;
            if (isError) {
               console.error(data);
               app.resources.analytics.logError(new Error(data.message));
               await new Promise((resolve) => {
                  app.pages.appPage.f7App.dialog
                     .alert(`<t>${data.message}</t>`, "<t>Error</t>", () => {
                        resolve();
                     })
                     .open();
               });
            } else await this.loadUserData(true, data);
            return;
         }
         (isError && callback(data)) || callback(null, data);
         pendingNetworkCallbacks[EVENT_KEY_LOAD_USER_DATA] = null;
      });
   }

   /**
    * Early initialization. This can happen even before the auth token is
    * setup.
    *
    * @param {App} app
    *
    * @return {Promise}
    **/
   async init(app) {
      this.app = app;
      this._lock = new app.utils.Lock();
   }

   async loadUserData(sync = false, backupUserData) {
      const lock = this._lock;
      const resources = this.app.resources;
      const storage = resources.storage;
      if (!sync)
         if (this._userData == null) {
            try {
               await lock.acquire();
               this._userData = await storage.get("user", "siteUserData");
               lock.release();
               return;
            } catch (err) {
               lock.release();
               throw err;
            }
         }

      // If this method has already been called, just wait for a response.
      const pendingNetworkCallbacks = this._pendingNetworkCallbacks;
      if (pendingNetworkCallbacks.loadUserData != null) {
         await new Promise((resolve) => {
            const waitForLoadingUserData = () => {
               if (pendingNetworkCallbacks.loadUserData == null) {
                  resolve();
                  return;
               }
               setTimeout(() => {
                  waitForLoadingUserData();
               }, TIME_WAIT_FOR_USER_DATA);
            };
            waitForLoadingUserData();
         });
         return;
      }
      const network = resources.network;
      const userData =
         backupUserData ||
         (await new Promise((resolve, reject) => {
            (async () => {
               pendingNetworkCallbacks.loadUserData = (err, result) => {
                  if (err != null) {
                     reject(new Error(err.message));
                     return;
                  }
                  resolve(result);
               };
               await network.get(
                  { url: network.validRoutes.user },
                  {
                     context: {
                        targetEventKey: EVENT_KEY_LOAD_USER_DATA,
                        targetEventPath: EVENT_PATH,
                     },
                  },
               );
            })();
         }));
      try {
         await lock.acquire();
         await storage.set("user", "siteUserData", userData || null);
         this._userData = userData;
         lock.release();
      } catch (err) {
         lock.release();
         throw err;
      }
   }

   get userData() {
      return structuredClone(this._userData);
   }
}

export default new Account();
