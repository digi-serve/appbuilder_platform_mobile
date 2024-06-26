/**
 * @class Account
 *
 * Manages the user's account credentials on the device
 *
 * Exports a singleton instance.
 */
"use strict";

import EventEmitter from "eventemitter2";

const EVENT_KEY_LOAD_USER_DATA = "load.user.data";
const EVENT_PATH = "resources.account";
const TIME_WAIT_FOR_USER_DATA = 1000;
class Account extends EventEmitter {
   constructor() {
      super();
      this._importInProgress = false;
      this._isInitializedListener = false;
      this._pendingNetworkCallbacks = {
         loadUserData: null,
      };
      this._userData = null;
      this.app = null;
      this.on(EVENT_KEY_LOAD_USER_DATA, (err, data) => {
         const pendingNetworkCallbacks = this._pendingNetworkCallbacks;
         const loadUserData = pendingNetworkCallbacks.loadUserData;

         // This is in case we reload and still receive a job response from MCC.
         if (loadUserData == null) {
            (err != null && console.error(err)) ||
               this.loadUserData(true, data);
            return;
         }
         (err != null && loadUserData(err)) || loadUserData(null, data);
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
    */
   async init(app) {
      this.app = app;
   }

   async loadUserData(sync = false, data) {
      const resources = this.app.resources;
      const storage = resources.storage;
      const pendingNetworkCallbacks = this._pendingNetworkCallbacks;

      // If this method has already been called, just wait for a response.
      await new Promise((resolve) => {
         const waitForUserData = () => {
            const loadUserData = pendingNetworkCallbacks.loadUserData;
            if (loadUserData == null) {
               resolve();
               return;
            }
            setTimeout(() => {
               waitForUserData();
            }, TIME_WAIT_FOR_USER_DATA);
         };
         waitForUserData();
      });
      if (
         !sync &&
         (this._userData ||
            (this._userData = await storage.get("user", "siteUserData")) !=
               null)
      )
         return;
      const network = resources.network;
      const userData =
         data ||
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
                  { url: network.validRoutes.config },
                  {
                     targetEventKey: EVENT_KEY_LOAD_USER_DATA,
                     targetEventPath: EVENT_PATH,
                  }
               );
            })();
         }));
      if (userData == null) {
         await storage.set("user", "siteUserData", null);
         const err = new Error("Not found username");
         err.code = "E_BADAUTHTOKEN";
         throw err;
      }
      await storage.set("user", "siteUserData", userData);
      this._userData = userData;
   }

   get userData() {
      return this._userData;
   }
}

export default new Account();
