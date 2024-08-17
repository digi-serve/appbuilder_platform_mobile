/**
 * @class LoadingPage
 *
 * This is a loading animation that is displayed by default as the app is
 * starting up. It may be invoked as needed with `show()`. Unlike other pages,
 * this also provides an `overlay()` method, which will show the loading
 * animation translucently layered on top of whatever page is currently active.
 *
 * Exports a singleton instance of the LoadingPage class.
 */
"use strict";

import Common from "./classes/Common.js";

class LoadingPage extends Common {
   constructor() {
      super(
         "loading-page",
         "lib/platform/pages/loadingPage.html",
         "lib/platform/pages/loadingPage.css",
      );
   }

   show() {
      this.$element.removeClass("overlay");
      this.$element.show();
   }

   hide() {
      this.$element.hide();
   }

   // Translucent overlay on top of another page
   overlay() {
      this.$element.addClass("overlay");
      this.$element.show();
   }
}

export default new LoadingPage();
