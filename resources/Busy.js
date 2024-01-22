/**
 * @class Busy
 *
 * A reusable Busy indicator.
 *
 */
"use strict";

import EventEmitter from "eventemitter2";

import { Translate, translate, t } from "./Translate";

class Busy extends EventEmitter {
   constructor() {
      super();

      this.dataReady = $.Deferred();
      this.busyInProgress = false;
      this.app = null;
   }

   setApp(app) {
      this.app = app;
   }

   setAntiFrustratedUserTimeout() {
      // check if we are still busy after 20 seconds
      setTimeout(() => {
         if (this.busyInProgress) {
            // Force kill the preloader
            this.app.dialog.close();
            // tell user we are still working in the background
            self.appPage.app.toast
            .create({
                  text: `<center><t data-cy="wip" >working in the background...</t></center>`,
               position: "center",
            })
            .open();
         }
      }, 20000);
   }

   show(text = "Saving") {
      if (!this.app) {
         console.error(
            "use of busy.show() before busy.setApp() is initialized."
         );
         return;
      }

      if (!this.busyInProgress) {
         this.busyInProgress = true;
         var xlatedText = t(text);
         this.app.dialog.preloader(xlatedText);
         this.setAntiFrustratedUserTimeout();
         // setTimeout(() => {
         //    // Force kill the preloader
         //    this.app.dialog.close();
         //    // tell user we are still working in the background
         //    self.appPage.app.toast
         //    .create({
         //          text: `<center><t data-cy="wip" >working in the background...</t></center>`,
         //       position: "center",
         //    })
         //    .open();
         // }, 20000);
      }
   }

   hide() {
      if (!this.app) {
         console.error(
            "use of busy.hide() before busy.setApp() is initialized."
         );
         return;
      }

      if (this.busyInProgress) {
         this.busyInProgress = false;
      }
      this.app.dialog.close();
   }
}

var busy = new Busy();
export default busy;
