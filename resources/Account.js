/**
 * @class Account
 *
 * Manages the user's account credentials on the device
 *
 * Exports a singleton instance.
 */
"use strict";

import EventEmitter from "eventemitter2";
import Log from "./Log.js";

const config = require("../../config/config.js");
const EVENT_NAME_PLATFORM_ACCOUNT_USERNAME = "platform.account.username";

class Account extends EventEmitter {
   constructor() {
      super();
      this._authToken = null;
      this._username = null;
      this.AB = null;
      this.f7App = null;

      this.importInProgress = false;

      this.tenantUUID = "???"; // this does nothing
      this.tenantID = "???";

      this._listRoles = null;
      // {array}
      // a list of all the Defined Roles in the Tenant's system.

      this._listScopes = null;
      // {array | null}
      // a list of all the Defined Scopes in the Tenant's sytem.

      this._listUsers = null;
      // {array | null}
      // a list of all the Defined Users in the Tenant's system.
   }

   /**
    * Early initialization. This can happen even before the auth token is
    * setup.
    *
    * @param {object} options
    * @param {Framework7} options.f7App
    *
    * @return {Promise}
    */
   async init(AB, f7App) {
      this.AB = AB;
      this.AB.network.on(
         EVENT_NAME_PLATFORM_ACCOUNT_USERNAME,
         async (context, data) => {
            if (context.error != null) context.callback?.(context.error);
            const callbackResult = context.callback?.(null, data);
            if (callbackResult instanceof Promise) await callbackResult;
         },
      );
      this.f7App = f7App;
      this._authToken = await this.AB.storage.get("authToken");
      if (this._authToken == null) {
         await this.AB.storage.set("siteUserData", null);
         return;
      }
      this._username = (
         await this.AB.storage.get("siteUserData")
      )?.user.username;
   }

   async fetchUserData() {
      if (this._authToken == null) {
         this._authToken = await this.AB.storage.get("authToken");
         if (this._authToken == null) throw new Error("Not found authToken!");
      }
      const data = await new Promise((resolve, reject) => {
         (async () => {
            await this.AB.network.get(
               { url: config.appbuilder.routes.userData },
               {
                  key: EVENT_NAME_PLATFORM_ACCOUNT_USERNAME,
                  context: {
                     callback: (err, result) => {
                        if (err != null) reject(new Error(err.message));
                        resolve(result);
                     },
                  },
               },
            );
         })();
      });
      await this.AB.storage.set("siteUserData", data);
      this._username = data.user.username;
      if (this._username == null) throw new Error("Not found username");
      this.AB.analytics.setUserName(this._username);
   }

   /**
    * Obtain the pre-token from the URL. And then generate a new authToken.
    *
    * @param {string} preToken
    * @param {string} tenantUUID
    * @return {Promise}
    */
   importCredentials(preToken, tenantUUID) {
      if (this.importInProgress) {
         Log("::: importSettings(): already in progress");
         return Promise.reject("Import already in progress");
      }
      this.importInProgress = true;

      // This is the loading progress modal dialog box

      //// TODO:
      //// figure out proper process for reseting the Account during an import
      //// --> This works, but is this the right place?

      var loader = this.f7App.dialog.progress("<t>Connecting your account</t>");

      Log("::: New Account Init Begin :::");
      var currentAuthToken = this._authToken;
      var newAuthToken = null;

      return (
         Promise.resolve()
            // Determine current status first
            .then(() => {
               // No existing authToken. Import immediately.
               if (!currentAuthToken) {
                  return null;
               }

               // Ask for confirmation to overwrite current account.
               // (this might never happen because this function is only called
               //  when authToken does not exist)
               else {
                  // Confirm switching to new authToken.
                  return new Promise((ok, cancel) => {
                     // Close the progress dialog box temporarily
                     if (loader && loader.$el) {
                        loader.$el.remove();
                        loader.close();
                        loader.destroy();
                     }
                     this.f7App.dialog.confirm(
                        "<t>This will reset the data on this device</t>",
                        "<t>Do you want to continue?</t>",
                        () => {
                           // [ok]
                           ok();
                        },
                        () => {
                           // [cancel]
                           cancel("Canceled by user");
                        },
                     );
                  });
               }
            })

            // Register auth token
            .then(() => {
               // Re-open the progress dialog box
               // loader.open();

               // #Hack! : for some reason framework7 .close() .destroy()
               // on a progress modal doesn't remove the modal (just makes
               // it invisible, but it will intefere with clicking on the
               // screen). So we manually remove it here:
               if (loader && loader.$el) {
                  loader.$el.remove();
                  loader.close();
               }
               loader = this.f7App.dialog.progress(
                  "<t>Connecting your account</t>",
               );
               return this.AB.network.registerAuthToken(preToken);
            })
            .then((authToken) => {
               this.AB.analytics.event("importSettings(): reset credentials");
               Log("::: importSettings(): reset credentials");
               return this.AB.network.reset().then(() => {
                  Log("::: importSettings(): saved new credentials");
                  this._authToken = authToken;
                  return this.AB.storage.set("authToken", this._authToken);
               });
            })
            .then(() => {
               return this.AB.storage.set("tenantUUID", tenantUUID);
            })

            .then(() => {
               if (loader && loader.$el) {
                  loader.$el.remove();
                  loader.close();
                  loader.destroy();
               }
               this.importInProgress = false;
               Log("::: importSettings(): all done!");
               this.AB.storage.testCrypto();
            })

            .catch((err) => {
               if (loader && loader.$el) {
                  loader.$el.remove();
                  loader.close();
                  loader.destroy();
               }

               // Canceled overwriting existing auth token with new one
               if (err == "Canceled by user") {
                  // (nothing to do? let the promise resolve.)
               }

               // Error
               else {
                  this.emit("QRInitError", {
                     message: "Error importing data",
                     error: err,
                  });
                  this.emit("importError", err);

                  Log("::: importSettings(): error");
                  Log.error("Error while importing credentials");
                  Log(err.message || err);
                  this.AB.analytics.logError(err);
                  this.importInProgress = false;
                  return Promise.reject(err);
               }
            })
      );
   }

   get authToken() {
      return this._authToken;
   }

   get username() {
      return this._username;
   }
}

export default new Account();
