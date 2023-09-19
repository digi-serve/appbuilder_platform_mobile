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
         setTimeout(() => {
            // Force kill the preloader
            this.app.dialog.close();
         }, 20000);
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
