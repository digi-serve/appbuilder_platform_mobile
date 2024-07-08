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
            abDC.name === "User Person"
      );
   }

   loadProfileData() {
      this._userProfile = this.dc.getData(
         (e) =>
            e["System Access"] ===
            this.page.app.resources.account.userData?.user.username
      )[0];
   }

   get userProfile() {
      return this._userProfile;
   }
}

export default new Profile();
