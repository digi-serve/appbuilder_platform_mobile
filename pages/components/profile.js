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
      this.personDC = this.page.app.abDCs.find(
         (abDC) => abDC.id === "User Person" || abDC.name === "User Person",
      );
      this.dc = this.personDC;
      this.emailDC = this.page.app.abDCs.find(
         (abDC) => abDC.id === "Email - mobile" || abDC.name === "Email - mobile",
      );
      this.socialDC = this.page.app.abDCs.find(
         (abDC) => abDC.id === "Social Media - mobile" || abDC.name === "Social Media - mobile",
      );
      this.assignmentDC = this.page.app.abDCs.find(
         (abDC) => abDC.id === "Assignments - mobile" || abDC.name === "Assignments - mobile",
      );
      this.familyMemberDC = this.page.app.abDCs.find(
         (abDC) => abDC.id === "Family Members" || abDC.name === "Family Members",
      );
      this.cityDC = this.page.app.abDCs.find(
         (abDC) => abDC.id === "City" || abDC.name === "City",
      );
      if (this.personDC) {
         this.personDC.on("loadData", () => {
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
            this.page.app.resources.account.userData?.user,
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
