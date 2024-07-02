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
      this.on(EVENT_KEY_LOAD_USER_DATA, (context, res) => {
         const pendingNetworkCallbacks = this._pendingNetworkCallbacks;
         const loadUserData = pendingNetworkCallbacks.loadUserData;

         // This is in case we reload and still receive a job response from MCC.
         const isError = res.status === "error";
         const data = res.data;
         if (loadUserData == null) {
            (isError && console.error(data)) || this.loadUserData(true, data);
            return;
         }
         (isError && loadUserData(data)) || loadUserData(null, data);
         pendingNetworkCallbacks.loadUserData = null;
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
      const pendingNetworkCallbacks = this._pendingNetworkCallbacks;

      // If this method has already been called, just wait for a response.
      if (pendingNetworkCallbacks.loadUserData != null) {
         await new Promise((resolve) => {
            const waitForLoadingUserData = () => {
               const loadUserData = pendingNetworkCallbacks.loadUserData;
               if (loadUserData == null) {
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
      const lock = this._lock;
      try {
         await lock.acquire();
         const resources = this.app.resources;
         const storage = resources.storage;
         if (backupUserData != null) {
            await storage.set("user", "siteUserData", backupUserData);
            lock.release();
            return;
         }
         if (
            !sync &&
            (this._userData ||
               (this._userData = await storage.get("user", "siteUserData")) !=
                  null)
         ) {
            lock.release();
            return;
         }
         lock.release();
         const network = resources.network;
         const userData = await new Promise((resolve, reject) => {
            (async () => {
               pendingNetworkCallbacks.loadUserData = (err, result) => {
                  if (err != null) {
                     reject(new Error(err.message));
                     return;
                  }
                  resolve(result);
               };
               await network.get(
                  { url: network.validRoutes.config },
                  {
                     context: {
                        targetEventKey: EVENT_KEY_LOAD_USER_DATA,
                        targetEventPath: EVENT_PATH,
                     },
                  }
               );
            })();
         });
         await lock.acquire();
         if (userData == null) {
            await storage.set("user", "siteUserData", null);
            lock.release();
            const err = new Error("Not found username");
            err.code = "E_BADAUTHTOKEN";
            throw err;
         }
         await storage.set("user", "siteUserData", userData);
         lock.release();
         this._userData = userData;
      } catch (err) {
         lock.release();
         throw err;
      }
   }

   get userData() {
      return this._userData;
   }
}

export default new Account();
