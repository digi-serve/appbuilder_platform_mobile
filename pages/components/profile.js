/**
 * @class Profile
 */
"use strict";

import Common from "./classes/Common.js";

const dcIDs = [
   "User Person",
   "Family Members",
   // "Address",
   "Assignments - mobile",
   "City",
   "Email - mobile",
   // "Languages",
   // "Phone - Mobile", /// ! ABSCENT
   "Social Media - mobile",
   // "Family Worker Information",
   // "Family Emails",
   // "Social Media",
];

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

   loadProfileData() {
      const app = this.page.app;
      this._userProfile = app.abDCs
         .find(
            (dc) =>
               dc.id === "User Person" ||
               // TODO (Guy): Refactor this to use only id.
               dc.name === "User Person"
         )
         .getData(
            (e) =>
               e["System Access"] ===
               app.resources.account.userData?.user.username
         )[0];
   }

   get userProfile() {
      return this._userProfile;
   }
}

export default new Profile();
