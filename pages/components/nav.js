/**
 * @class Nav
 */
"use strict";

import Common from "./classes/Common.js";

class Nav extends Common {
   /**
    */
   constructor() {
      super(null, [
         {
            path: "/nav/",
            componentUrl: "./lib/platform/pages/components/nav.html",
         },
         {
            path: "/nav/lock/",
            componentUrl: "./lib/platform/pages/components/nav-lock.html",
         },
      ]);
   }
}

export default new Nav();
