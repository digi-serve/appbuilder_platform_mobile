/**
 * @class Account
 *
 * Manages the user's account credentials on the device
 *
 * Exports a singleton instance.
 */
"use strict";

import analytics from "./Analytics.js";
import EventEmitter from "eventemitter2";
import Log from "./Log.js";
import Network from "./Network";
import { storage } from "./Storage.js";
import updater from "./Updater.js";

var config = require("../../config/config.js");

class Account extends EventEmitter {

   constructor() {
      super();

      this.f7app = null;
      this.authToken = null;
      this.username = "??";

      this.importInProgress = false;

      this.relayReady = null;
      // {Deferred} : used to track a pending call to load the
      // site user data ( .initUserData() )
   }

   /**
    * Early initialization. This can happen even before the auth token is
    * setup.
    * 
    * @param {object} options
    * @param {Framework7} options.app
    *
    * @return {Promise}
    */
   init(options = {}) {
      this.f7app = options.app;
      return new Promise((resolve) => {
         storage
            .get("authToken")
            .then((value) => {
               // `value` might still be NULL
               this.authToken = value;
               return storage.get("siteUserData");
            })
            .then((siteUserData) => {
               if (siteUserData) {
                  try {
                     this.username = siteUserData.user.username;
                     if (this.username != "??") {
                        analytics.setUserName(this.username);
                     }
                  }
                  catch (err) {
                     console.error("Couldn't read username from stored data");
                     console.error("Do we need it?");
                     console.error(err);
                  }
               }
               resolve();
            });
      });
   }

   initUserData() {
      return new Promise((resolve /*, reject */) => {
         // @TODO: implement reject() case
         if (this.username != "??") {
            resolve();
         } else {
            // 1st time through, we create the deferred, and
            // make the network call to store the data.
            if (!this.relayReady) {
               this.relayReady = $.Deferred();

               // create a callback for our network job response:
               var responseContext = {
                  key: "platform.account.username",
                  context: {}
               };
               Network.on(responseContext.key, (context, data) => {
                  storage.set("siteUserData", data)
                     .then(() => {
                        try {
                           this.username = data.user.username;
                           if (this.username != "??") {
                              analytics.setUserName(this.username);
                           }
                        }
                        catch (err) {
                           console.error("What is the username for anyway?");
                           console.error(err);
                        }
                        this.relayReady.resolve();
                     });
               });

               // Call the url
               Network.get(
                  { url: config.appbuilder.routes.userData },
                  responseContext
               );
            }

            // every time through, we make sure the returned promise
            // gets resolved() when our relayReady is resolved.
            this.relayReady.then(() => {
               resolve();
            });
         }
      });
   }

   /**
    * Delivers the auth token. Checks the device storage if needed.
    * 
    * @return {Promise}
    */
   getAuthToken() {
      return Promise.resolve()
         .then(() => {
            // Already loaded in memory
            if (this.authToken) {
               return this.authToken;
            }
            // Fetch from storage
            else {
               return storage.get("authToken");
            }
         })
         .then((authToken) => {
            this.authToken = authToken;
            return authToken;
         })
   }

   /**
    * Reset credentials and set a new auth token.
    * Used by importCredentials()
    *
    * @param {string} authToken
    * @return {Promise}
    */
   setAuthToken(authToken) {
      analytics.event("importSettings(): reset credentials");
      Log("::: importSettings(): reset credentials");
      return Network.reset().then(() => {
         Log("::: importSettings(): saved new credentials");
         this.authToken = authToken;
         return storage.set("authToken", this.authToken);
      });
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
      this.relayReady = null;

      var loader = this.f7app.dialog.progress(
         "<t>Connecting your account</t>"
      );

      Log("::: New Account Init Begin :::");
      var currentAuthToken = this.authToken;
      var newAuthToken = null;

      return Promise.resolve()
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
                  this.f7app.dialog.confirm(
                     "<t>This will reset the data on this device</t>",
                     "<t>Do you want to continue?</t>",
                     () => {
                        // [ok]
                        ok();
                     },
                     () => {
                        // [cancel]
                        cancel("Canceled by user");
                     }
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
            loader = this.f7app.dialog.progress(
               "<t>Connecting your account</t>"
            );
            return Network.registerAuthToken(preToken);
         })
         .then((authToken) => {
            return this.setAuthToken(authToken);
         })
         .then(() => {
            return storage.set("tenantUUID", tenantUUID);
         })

         .then(() => {
            if (loader && loader.$el) {
               loader.$el.remove();
               loader.close();
               loader.destroy();
            }
            this.importInProgress = false;
            Log("::: importSettings(): all done!");
            this.emit("imported"); // appPage.js will restart app?
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
                  error: err
               });
               this.emit("importError", err);

               Log("::: importSettings(): error");
               Log.error("Error while importing credentials");
               Log(err.message || err);
               analytics.logError(err);

               /*
               this.f7app.dialog.alert(
                  err.message || err,
                  "<t>Error connecting account</t>"
               );
               */

               this.importInProgress = false;
               return Promise.reject(err);
            }
         });
   }
}

var account = new Account();
export default account;
