/**
 * @class Inbox
 */
"use strict";

import Common from "./classes/Common";

const FEEDBACK_TIMEOUT = 15000;
class Feedback extends Common {
   /**
    */
   constructor() {
      super([
         {
            path: "/feedback/",
            popup: {
               componentUrl: "./lib/platform/pages/components/feedback.html",
            },
         },
      ]);

      // These properties are kept in storage between sessions
      this.note = "";
      this.photoFilename = null;
      this.photoURL = null;
      this.on("feedback-photo-upload", () => {});
      // Should we set default values?
      this.objectID = "281b5672-bc04-4463-b22e-de3494d872a7";
      this.imageFieldID = "59d65c3c-c62b-4c3f-865b-ce79b280c6d7";
   }

   /**
    * init()
    * called by the platform (app.js) after the Storage mechanism is
    * already initialized and ready to go.
    */
   async init(page) {
      await super.init(page);
      this.dc = this.page.app.abDCs.find(
         (abDC) => abDC.id === "Feedback" || abDC.name === "Feedback",
      );
      if (this.dc) {
         this.objectID = this.dc.datasource.id;
         const imageField = this.dc.datasource.fields(
            (field) => field.columnName === "Screenshot",
         )[0];
         this.imageFieldID = imageField.id 
      }

      this.cachedState = {
         file: null,
      };

      // this.imageFieldID = "59d65c3c-c62b-4c3f-865b-ce79b280c6d7";
      // const page = this.page;
      const app = page.app;
      const resources = app.resources;
      const storage = resources.storage;
      const network = resources.network;
   }

   /**
    * Delete previous attached photo, if any.
    *
    * @return {Promise}
    */
   async deletePhoto() {
      let filename = this.photoFilename;
      URL.revokeObjectURL(this.cachedState.file);
      this.photoFilename = null;
      this.photoURL = null;
   }

   /**
    * Get a new library photo from the user.
    * This loads new data into these object properties:
    *  - photoFilename
    *  - photoURL
    *
    * @return {Promise}
    */
   async getPhoto() {
      this.cachedState.file =
         await this.page.app.resources.camera.getPhoto(false);
      this.photoFilename = this.cachedState.file.name;
      this.photoURL = URL.createObjectURL(this.cachedState.file);
   }

   /**
    * Submit the feedback to the server.
    *
    * @param {string} note
    *
    * @return {Promise}
    */
   async sendFeedback(note = "") {
      if (!note && !this.photoFilename) throw new Error("Nothing to send");

      const app = this.page.app;
      const page = this.page;
      const busy = app.resources.busy;
      const username = app.resources.account.userData?.user;
      busy.show();
      const file = this.cachedState.file;
      var fileid = null;
      if (file) {
         fileid = await this.page.app.resources.storage.uploadFile(
            this.objectID,
            this.imageFieldID,
            {
               file,
               uploadedBy: username,
            },
         );
         this.cachedState.file = null
      }

      await new Promise((resolve, reject) => {
         const loadingPage = app.pages.loadingPage;
         let timeout = setTimeout(() => {
            timeout = false;
            loadingPage.hide();
            reject(new Error("Feedback timed out!"));
         }, FEEDBACK_TIMEOUT);

         if (username == null) {
            // TODO (Guy): Alert to the user.
            reject(new Error("No user profile!"));
         }

         const data = {
            Description: note,
            userAgent: navigator.userAgent,
            packageInfoversion: "",
            packageInfodescription: "",
            packageInfolabel: "",
            packageInfodeploymentKey: "",
            route: "",
            history: "",
            "Submitted By": username,
            Source: "Mobile App",
            Timestamp: moment(new Date().toISOString()), // note that this is the user's local time
            Time: moment(new Date().toISOString()),
         };
         if (fileid?.data?.uuid) {
            data["Screenshot"] = fileid.data.uuid;
         }
         const router = page.appView.router;
         data.route = router.previousRoute.path;
         data.history = router.history.join(" --> ");
         data.packageInfoversion = app.buildTimeStamp;
         (async () => {
            try {
               // loadingPage.overlay();
               await this.dc.setData(null, data);
               busy.hide();
               app.pages.appPage.f7App.toast
                  .create({
                     icon: '<i class="fa-2x fas fa-inbox"></i>',
                     text: "<t>Feedback Sent</t>",
                     position: "center",
                  })
               .open();
               if (timeout !== false) {
                  clearTimeout(timeout);
                  resolve();
               }
            } catch (err) {
               busy.hide();
               if (timeout !== false) {
                  clearTimeout(timeout);
                  resolve();
               }

               app.pages.appPage.f7App.toast
                  .create({
                     icon: '<i class="fa-2x fas fa-exclamation-triangle"></i>',
                     text: "<t>Error sending feedback!</t>",
                     position: "center",
                  })
               .open();
               reject(err);
            }
         })();
      });
   }
}

export default new Feedback();
