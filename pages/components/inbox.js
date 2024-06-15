/**
 * @class Inbox
 */
"use strict";

import EventEmitter from "eventemitter2";

class Inbox extends EventEmitter {
   /**
    */
   constructor() {
      super();
      this.page = null;
      this.route = {
         path: "/inbox/",
         componentUrl: "./lib/platform/pages/components/inbox-list.html",
         routes: [
            {
               path: "formio/:id/",
               popup: {
                  componentUrl: "./lib/platform/pages/components/inbox-formio.html"
               }
            }
         ]
      }
   }

   async init(page) {
      this.page = page;
   }
}

export default new Inbox();
