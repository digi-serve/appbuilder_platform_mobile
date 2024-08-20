/**
 * @class Profile
 */
"use strict";

import Common from "./classes/Common.js";

class Profile extends Common {
   /**
    */
   constructor() {
      super([
         {
            path: "/profile/",
            componentUrl: "/lib/platform/pages/components/profile-landing.html",
            routes: [
               {
                  path: "details/:uuid",
                  popup: {
                     componentUrl:
                        "./lib/platform/pages/components/profile-details.html",
                  },
               },
            ],
         },
      ]);
      this._userProfile = null;
   }

   async init(page) {
      await super.init(page);
      this.dc = this.page.app.abDCs.find(
         (abDC) =>
            abDC.id === "User Person" ||
            // TODO (Guy):
            abDC.name === "User Person",
      );
      if (this.dc) {
         this.dc.on("loadData", () => {
            this.loadProfileData();
         });
      }
   }

   loadProfileData() {
      this._userProfile = this.dc.getData(
         (e) =>
            // Sentry Error: SDC-1NP, SDC-1NN
            // in some case: e.data is undefined
            e.data?.["System Access"] ===
            this.page.app.resources.account.userData?.user.username,
      )[0]?.data;
   }

   get userProfile() {
      return structuredClone(this._userProfile);
   }

   isReady() {
      return this.userProfile != null;
   }
}

export default new Profile();
