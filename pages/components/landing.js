/**
 * @class Landing
 */
"use strict";

import Common from "./classes/Common.js";

class Landing extends Common {
   constructor() {
      super(
         [
            {
               path: "/",
               componentUrl: "./lib/platform/pages/components/landing.html",
            },
         ],
         null,
         {
            wildcard: true,
         }
      );
   }
}

export default new Landing();
