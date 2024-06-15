/**
 * @class Account
 *
 * Manages the user's account credentials on the device
 *
 * Exports a singleton instance.
 */
"use strict";

import EventEmitter from "eventemitter2";

const NETWORK_EVENT_KEY_FETCH_USER_DATA = "get.user.data";
const NETWORK_EVENT_PATH = "resources.account";
const TIMEOUT_WAIT_FOR_USER_DATA = 1000;
class Account extends EventEmitter {
   constructor() {
      super();
      this._importInProgress = false;
      this._isInitializedListener = false;
      this._pendingNetworkCallbacks = {
         fetchUserData: null,
      };
      this._username = null;
      this.app = null;
      this.on(NETWORK_EVENT_KEY_FETCH_USER_DATA, (context, res) => {
         const fetchUserData = this._pendingNetworkCallbacks.fetchUserData;

         // This is in case we reload and still receive a job response from MCC.
         const data = res.data;
         if (fetchUserData == null) {
            if (context.error != null) console.error(context.error);
            else this.fetchUserData(data);
            return;
         }
         if (context.error != null) fetchUserData(context.error);
         else fetchUserData(null, data);
         this._pendingNetworkCallbacks.fetchUserData = null;
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

   async fetchUserData(data) {
      const resources = this.app.resources;
      const storage = resources.storage;
      const pendingNetworkCallbacks = this._pendingNetworkCallbacks;

      // If this method has already been called, just wait for a response.
      await new Promise((resolve) => {
         const waitForUserData = () => {
            const fetchUserData = pendingNetworkCallbacks.fetchUserData;
            if (fetchUserData == null) {
               resolve();
               return;
            }
            setTimeout(() => {
               waitForUserData();
            }, TIMEOUT_WAIT_FOR_USER_DATA);
         };
         waitForUserData();
      });
      if (
         this._username ||
         (this._username = (
            await storage.get("user", "siteUserData")
         )?.user.username) != null
      )
         return;
      const network = resources.network;
      const userData =
         data ||
         (
            await new Promise((resolve, reject) => {
               (async () => {
                  pendingNetworkCallbacks.fetchUserData = (err, result) => {
                     if (err != null) {
                        reject(new Error(err.message));
                        return;
                     }
                     resolve(result);
                  };
                  await network.get(
                     { url: network.validRoutes.config },
                     {
                        key: network.validRoutes.config,
                        context: {
                           targetEventKey: NETWORK_EVENT_KEY_FETCH_USER_DATA,
                           targetEventPath: NETWORK_EVENT_PATH,
                        },
                     }
                  );
               })();
            })
         );
      const username = userData.user.username;
      if (username == null) {
         await storage.set("user", "siteUserData", null);
         const err = new Error("Not found username");
         err.code = "E_BADAUTHTOKEN";
         throw err;
      }
      await storage.set("user", "siteUserData", userData);
      this._username = username;
   }

   get username() {
      return this._username;
   }
}

export default new Account();
