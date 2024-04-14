/*
 * initDefaultPages.js
 * Setup the main application Pages
 */
import loadingPage from "../pages/loadingPage.js";
import passwordPage from "../pages/password/passwordPage.js";
import appPage from "../pages/app/appPage.js";

// Initialize the top level pages.
const pages = {
   loadingPage,
   passwordPage,
   appPage, // will contain all Framework7 sub pages
};

export default {
   init: async (AB, appUUID) => {
      // Setup the Pages
      let pageKeyErr = "";
      try {
         await pages.loadingPage.init(AB);
         await pages.passwordPage.init(AB);
         await pages.appPage.init(AB, appUUID);
      } catch (err) {
         console.error(err);
         $.alert(
            (err.message || "") + "<br />" + (err.stack || ""),
            `Error starting ${pageKeyErr}`
         );
         AB.analytics.logError(err);
      }

      pages.passwordPage.on("loading", () => {
         pages.loadingPage.overlay();
      });
      pages.passwordPage.on("loadingDone", () => {
         pages.loadingPage.hide();
      });
      pages.passwordPage.on("passwordReady", () => {
         // After password is ready, make the main app visible.
         // If there are transparent UI elements on the password page, the main
         // app page will show through under that.
         pages.appPage.$element.show();
      });
      pages.passwordPage.on("passwordDone", () => {
         // Fully show the main app page, and hide the password page.
         pages.appPage.show();
      });
   },
   show: (pageKey) => {
      switch (pageKey) {
         case "appPage":
            // making sure other objects respond to any password signals:
            // simulate the password process:
            pages.passwordPage.emit("loading");
            pages.passwordPage.emit("loadingDone");
            pages.passwordPage.emit("passwordReady");
            pages.passwordPage.emit("passwordDone");
      }

      if (pages[pageKey]) {
         pages[pageKey].show();
      }
   },
};
