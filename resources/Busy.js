/**
 * @class Busy
 *
 * A reusable Busy indicator.
 *
 */
"use strict";

import EventEmitter from "eventemitter2";

class Busy extends EventEmitter {
   constructor() {
      super();
      this.app = null;
      this.busyInProgress = false;
   }

   async init(app) {
      this.app = app;
   }

   show(text = "Saving", timeout) {
      if (this.app.pages.appPage.f7App == null) {
         console.error(
            "use of busy.show() before busy.setApp() is initialized.",
         );
         return;
      }
      if (this.busyInProgress) this.hide();
      this.busyInProgress = true;
      this.app.pages.appPage.f7App.dialog.preloader(this.app.resources.translate.t(text));
      if (timeout == null) return;
      setTimeout(() => {
         // Force kill the preloader
         this.app.pages.appPage.f7App.dialog.close();

         // tell user we are still working in the background
         this.app.pages.appPage.f7App.toast
            .create({
               text: `<center><t data-cy="wip" >working in the background...</t></center>`,
               position: "center",
            })
            .open();
      }, 20000);
   }

   hide() {
      if (this.app.pages.appPage.f7App == null) {
         console.error(
            "use of busy.hide() before busy.setApp() is initialized.",
         );
         return;
      }

      if (this.busyInProgress) this.busyInProgress = false;
      this.app.pages.appPage.f7App.dialog.close();
   }
}

export default new Busy();
