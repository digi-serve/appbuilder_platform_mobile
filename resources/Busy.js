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

   /**
    * Early initialization. This can happen even before the auth token is
    * setup.
    *
    * @param {App} app
    *
    * @return {Promise}
    **/
   async init(app) {
      this.app = app;
   }

   show(text = "Saving", timeout) {
      if (this.busyInProgress) this.hide();
      this.busyInProgress = true;
      const app = this.app;
      const f7App = app.pages.appPage.f7App;
      const dialog = f7App.dialog;
      dialog.preloader(app.resources.translate.t(text));
      if (timeout == null) return;
      setTimeout(() => {
         // Force kill the preloader
         dialog.close();

         // tell user we are still working in the background
         f7App.toast
            .create({
               text: `<center><t data-cy="wip" >working in the background...</t></center>`,
               position: "center",
            })
            .open();
      }, 20000);
   }

   hide() {
      if (this.busyInProgress) this.busyInProgress = false;
      this.app.pages.appPage.f7App.dialog.close();
   }
}

export default new Busy();
