/**
 * @class Inbox
 */
"use strict";

import Common from "./classes/Common";

class Inbox extends Common {
   /**
    */
   constructor() {
      super([
         {
            path: "/inbox/",
            componentUrl: "./lib/platform/pages/components/inbox-list.html",
            routes: [
               {
                  path: "formio/:id/",
                  popup: {
                     componentUrl:
                        "./lib/platform/pages/components/inbox-formio.html",
                  },
               },
            ],
         },
      ]);
   }
}

export default new Inbox();
