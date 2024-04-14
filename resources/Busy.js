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
      this.f7App = null;
   }

   setApp(f7App) {
      this.f7App = f7App;
   }

   show(text = "Saving", timeout) {
      if (this.f7App == null) {
         console.error(
            "use of busy.show() before busy.setApp() is initialized.",
         );
         return;
      }
      if (this.busyInProgress) this.hide();
      this.busyInProgress = true;
      this.f7App.dialog.preloader(t(text));
      if (timeout == null) return;
      setTimeout(() => {
         // Force kill the preloader
         this.f7App.dialog.close();

         // tell user we are still working in the background
         self.appPage.f7App.toast
            .create({
               text: `<center><t data-cy="wip" >working in the background...</t></center>`,
               position: "center",
            })
            .open();
      }, 20000);
   }

   hide() {
      if (this.f7App == null) {
         console.error(
            "use of busy.hide() before busy.setApp() is initialized.",
         );
         return;
      }

      if (this.busyInProgress) this.busyInProgress = false;
      this.f7App.dialog.close();
   }
}

export default new Busy();
