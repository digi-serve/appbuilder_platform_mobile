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
      this._importInProgress = false;
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
    */
   async init(app) {
      this.app = app;
   }

   async loadUserData(sync = false, backupUserData) {
      const resources = this.app.resources;
      const storage = resources.storage;
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
      if (
         !sync &&
         (this._userData ||
            (this._userData = await storage.get("user", "siteUserData")) !=
               null)
      )
         return;
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
                  { url: network.validRoutes.config },
                  {
                     context: {
                        targetEventKey: EVENT_KEY_LOAD_USER_DATA,
                        targetEventPath: EVENT_PATH,
                     },
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
