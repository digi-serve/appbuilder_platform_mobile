/**
 * @class Status
 *
 * A reusable Status indicator.
 * https://github.com/digi-serve/ns_app/issues/312
 * We need to be able to show a status message to the user.
 *
 * Display all currently syncing data collections (and or specific report?)
 * Status of syncing: starting, waiting for response, timed out, retrying,
 *
 * Triggered on report from "Save" functions that user expects something to happen
 * If already open, add to the list of status messages
 *
 * Track ongoing network traffic
 *  On data start-send (local success)
 *  On data bounce back (sign of success)
 *  On data timeout
 *  On data fail (offline?)
 *
 * Store status queue of in local storage
 * as user may need to restart app in case of error
 *
 */
"use strict";

import EventEmitter from "eventemitter2";

//
import { storage } from "./Storage.js";

//import { Translate, translate, t } from "./Translate";
import { forEach } from "lodash";
//import { display } from "html2canvas/dist/types/css/property-descriptors/display";

class Status extends EventEmitter {
   constructor() {
      super();

      this.dataReady = $.Deferred();
      this.inProgress = false;
      this.onGoingWork = [];
      this.app = null;
   }

   setApp(app) {
      this.app = app;
   }

   bootDataReady() {
      // TODO
      // read the upload queue from local storage
      // convert to a list of status messages
      // or do we wait for network to emit what is happening?
      var readSyncStatus = storage.get("networkQueue").then((value) => {
         this.relayState = value || {
            aesKeySent: false,
            lastSyncDate: null,
         };
      });
   }

   // User triggered a save, we receive a report of what is expected to happen
   add(dataCollections, identifyText) {
      // lets try to pass some unique text so user can know what record is mentioned in future status messages
      if (!this.app) {
         console.error(
            "use of status.show() before status.setApp() is initialized."
         );
         return;
      }
      this.inProgress = true;
      // add to our list of status messages
      forEach(dataCollections, (dataCollection) => {
         // TODO what error checking should we do here?
         this.onGoingWork.push(dataCollection);
      });
      // make sure our display banner is running
      this.show();
   }

   show() {
      if (!this.app) {
         console.error(
            "use of status.show() before status.setApp() is initialized."
         );
         return;
      }

      // cycle through displaying our list of status messages

      // TODO translate text
      // var xlatedText = t(text);
      this.displayLoop();
   }

   // for each status, display a banner for three seconds
   // recursively call banner() while there are status messages to display
   // messages will be removed elsewhere, when the status is complete
   displayLoop() {
      if (this.onGoingWork.length) {
         forEach(this.onGoingWork, (dataCollection) => {
            // we should be able to shut this off at any time
            if (this.inProgress) {
               this.banner(dataCollection);
            }
         });
      }
      // if keep going
      if (this.inProgress) {
         this.displayLoop();
      }
   }

   banner(dataCollection) {
      let text = dataCollection.text;
      this.app.toast
         .create({
            text,
            closeTimeout: 40000, // Close the after 3 seconds
         })
         .open();
   }

   updateJob(status, job) {
      console.log("Status:: updateJob():", status, job);
      // TODO
   }

   online() {
      console.log("Status:: online()");
      // TODO
   }
   offline() {
      console.log("Status:: offline()");
      // TODO
   }

   hide() {
      if (!this.app) {
         console.error(
            "use of status.hide() before status.setApp() is initialized."
         );
         return;
      }

      if (this.inProgress) {
         this.inProgress = false;
      }
      this.app.dialog.close();
   }
}

var status = new Status();
export default status;
