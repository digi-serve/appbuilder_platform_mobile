/**
 * @class Account
 *
 * Manages the user's account credentials on the device
 *
 * Exports a singleton instance.
 */
"use strict";

import EventEmitter from "eventemitter2";

const config = require("../../config/config.js");
const NETWORK_EVENT_KEY_USER_GET = "user.get";

class Account extends EventEmitter {
   constructor() {
      super();
      this._authToken = null;
      this._importInProgress = false;
      this._isInitializedListener = false;
      this._username = null;
      this.app = null;
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
      if (this._isInitializedListener) return;
      this.app.resources.network.on(
         NETWORK_EVENT_KEY_USER_GET,
         async (context, data) => {
            if (context.callback == null) return;
            if (context.error != null) context.callback(context.error);
            const callbackResult = context.callback(null, data);
            if (callbackResult instanceof Promise) await callbackResult;
         }
      );
      this._isInitializedListener = true;
   }

   async fetchUserData() {
      const resources = this.app.resources;
      const storage = resources.storage;
      if (
         this._username ||
         (this._username = (
            await storage.get("user", "siteUserData")
         )?.user.username) != null
      )
         return;
      const userData = await new Promise((resolve, reject) => {
         (async () => {
            await resources.network.get(
               { url: config.appbuilder.routes.userData },
               {
                  key: NETWORK_EVENT_KEY_USER_GET,
                  context: {
                     callback: (err, result) => {
                        if (err != null) {
                           reject(new Error(err.message));
                           return;
                        }
                        resolve(result);
                     },
                  },
               }
            );
         })();
      });
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
