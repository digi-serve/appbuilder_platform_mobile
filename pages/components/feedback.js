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
      // network.on("feedback-photo-upload", (context, data) => {
      //    Promise.resolve()
      //       .then(() => {
      //          var updatedFeedback = {
      //             uuid: context.uuid,
      //             Screenshot: data.uuid,
      //          };

      //          this.object("Feedback")
      //             .model()
      //             .update(updatedFeedback.uuid, updatedFeedback);
      //       })
      //       .catch((err) => {
      //          this.page.f7App.dialog.alert(err.message || err, "<t>Error</t>");
      //       });
      // });
   }

   /**
    * init()
    * called by the platform (app.js) after the Storage mechanism is
    * already initialized and ready to go.
    */
   async init(page) {
      await super.init(page);
      this.dc = this.page.app.abDCs.find(
         (abDC) =>
            abDC.id === "Feedback" ||
            // TODO (Guy):
            abDC.name === "Feedback"
      );
      // Load previous attached photo if it's still there
      // await storage
      //    .get("feedback-data")
      //    .then((data) => {
      //       if (data) {
      //          this.note = data.note;
      //          this.photoFilename = data.photoFilename;
      //          // assert that this is a function
      //          console.assert(
      //             typeof camera.loadPhotoByName == "function",
      //             "camera.loadPhotoByName is not a function"
      //          );
      //          return camera.loadPhotoByName(this.photoFilename);
      //       }
      //    })
      //    .then((photo) => {
      //       if (photo) {
      //          this.photoURL = photo.url;
      //       }
      //    })
      //    .catch((err) => {
      //       this.photoFilename = null;
      //       this.photoURL = null;
      //    });
   }

   /**
    * Delete previous attached photo, if any.
    *
    * @return {Promise}
    */
   async deletePhoto() {
      let filename = this.photoFilename;
      this.photoFilename = null;
      this.photoURL = null;
      // await this.dc.setData()
      // await storage.set(this.dc.refStorage(), "feedback-data", {
      //    note: this.note,
      // });
      // return Promise.resolve()
      //    .then(() => {
      //       var filename = this.photoFilename;

      //       this.photoFilename = null;
      //       this.photoURL = null;

      //       storage.set("feedback-data", {
      //          note: this.note,
      //       });

      //       if (filename) {
      //          return camera.deletePhoto(filename);
      //       }
      //    })
      //    .catch((err) => {
      //       return null;
      //    });
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
      // return this.deletePhoto()
      //    .then(() => {
      //       return camera.getLibraryPhoto();
      //    })
      //    .then((photo) => {
      //       this.photoFilename = photo.filename;
      //       this.photoURL = photo.url;
      //       storage.set("feedback-data", {
      //          note: this.note,
      //          photoFilename: this.photoFilename,
      //       });
      //       this.photoURL = photo.url;
      //    });
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

      await new Promise((resolve, reject) => {
         const loadingPage = app.pages.loadingPage;
         let timeout = setTimeout(() => {
            timeout = false;
            loadingPage.hide();
            reject(new Error("Feedback timed out!"));
         }, FEEDBACK_TIMEOUT);

         const page = this.page;
         const author = page.components.profile.userProfile;
         if (author == null) {
            // TODO (Guy): Alert to the user.
            reject(new Error("No user profile!"));
         }
         const data = {
            // uuid: app.utils.uuidv4(),
            Description: note,
            userAgent: navigator.userAgent,
            packageInfoversion: "",
            packageInfodescription: "",
            packageInfolabel: "",
            packageInfodeploymentKey: "",
            route: "",
            history: "",
            "Submitted By": author,
         };
         const router = page.appView.router;
         data.route = router.previousRoute.path;
         data.history = router.history.join(" --> ");
         data.packageInfoversion = info.version;
         data.packageInfodescription = info.description;
         data.packageInfolabel = info.label;
         data.packageInfodeploymentKey = info.deploymentKey;
         (async () => {
            try {
               loadingPage.overlay();
               await this.dc.setData(null, data);
               const app = page.app;
               const base64 = await app.resources.camera.base64ByName(
                  this.photoFilename
               );
               // Add screenshot base64 data if available
               if (base64 != null) {
                  // for the URL API:
                  // now fire off the Relay Request.
                  // NOTE: the Feedback app should already be listening for this event
                  // and will send that to our updateReceipt funtion
                  return app.resources.network.post(
                     {
                        url: "/opsportal/imageBase64",
                        data: {
                           appKey: "Feedback",
                           permission: "opstool.AB_Feedback.view",
                           image: base64,
                        },
                     },
                     {
                        key: "feedback-photo-upload",
                        context: {
                           uuid: data.uuid,
                        },
                     }
                  );
               }
               loadingPage.hide();
               if (timeout !== false) {
                  clearTimeout(timeout);
                  resolve();
               }
            } catch (err) {
               loadingPage.hide();
               reject(err);
            }
         })();
      });
   }
}

export default new Feedback();
