// import Applications from "../../applications/applications.js";
import getAppPage from "../pages/app/appPage.js";

("use strict");

// Template7 is required
if (typeof Template7 == "undefined") {
   throw new Error("Template7 is required to build helpers");
}

// // Applications is required...imported above
// if (typeof Applications == "undefined") {
//    throw new Error("Applications is required to build helpers");
// }

// moment is required
if (typeof moment == "undefined") {
   throw new Error("moment is required to build helpers");
}

// Helper to display object properties that have two or more word names
// ex: {{print parent 'object'}}\
/* global Template7 */
Template7.registerHelper("print", (parent, object, alternateObject) => {
   if (!parent) {
      return "";
   }
   var result = parent[object] ? parent[object] : parent[alternateObject];
   return typeof result != "undefined" ? result : "";
});

// Helper to display object property that have two or more word names
// in a HTML friendly way. replace spaces with underscores
// ex: {{print parent 'object'}}\
// "Pu Juan" becomes "Pu_Juan"
/* global Template7 */
Template7.registerHelper("printHTML", (parent, object, alternateObject) => {
   if (!parent) {
      return "";
   }
   var result = parent[object] ? parent[object] : parent[alternateObject];
   return typeof result != "undefined" ? result.replace(/ /g, "_") : "";
});

// Helper to format date string into usable date Information
// default format is "YYYY-MM-DD"
// ex: {{date parent 'object'}} outputs YYYY-MM-DD of the date passed
// ex: {{date parent 'object' 'MM-DD-YYYY'}} outputs MM-DD-YYYY of the date passed
Template7.registerHelper("date", (parent, object, template) => {
   var temp = "YYYY-MM-DD";
   if (typeof template == "string") {
      temp = template;
   }
   /* global moment */
   return moment(parent[object]).format(temp);
});

// Helper to get the first letter of a name/word
// ex: {{initial parent 'object'}}
Template7.registerHelper("initial", (parent, object, alternateObject) => {
   if (!parent || (!parent[object] && !parent[alternateObject])) return "";
   var result = parent[object]
      ? parent[object].substring(0, 1)
      : parent[alternateObject].substring(0, 1);
   return typeof result != "undefined" ? result : "";
});

// Helper to get the translated value of a field that was a select list
// ex: {{listItem 'app' 'obj' 'item' selected}}
Template7.registerHelper(
   "listItem",
   (appID, obj, item, selected, language_code) => {
      const app = getAppPage().getApplicationByID(appID);

      // this is a sample of how we populate list options
      var list = app.listItems(
         obj,
         item,
         language_code || app.application.languageDefault()
      );

      if (selected[item]) {
         var selectedItem = selected[item];

         var chosen = list.filter((p) => {
            return p.id == selectedItem;
         });
         if (chosen[0] && chosen[0].label) {
            return chosen[0].label;
         }
      } else {
         return "";
      }
   }
);

// Helper to return HTML of a list of items from a field that was a select list
// ex: {{listItems 'app' 'obj' 'item' selected '<option %selected% value="%id%">%label%</option>'}}
// %selected% will return selected='selected' if you are using this in a select input
// %label% will return the translated label of the option
// %id% will return the id/value of the option
Template7.registerHelper(
   "listItems",
   (appID, obj, item, selected, template) => {
      const app = getAppPage().getApplicationByID(appID);

      // this is a sample of how we populate list options
      var list = app.listItems(obj, item, app.application.languageDefault());

      // If data is selected, get text
      if (selected && selected[item]) {
         var selectedItem = selected[item];

         var chosen = list.filter((p) => {
            return p.id == selectedItem;
         })[0];
      }

      if (list.length) {
         var html = "";
         list.forEach((l) => {
            var selectedAttr = "";
            if (chosen && chosen.id == l.id) {
               selectedAttr = "selected='selected'";
            }
            html += template
               .replace(/%label%/g, l.label)
               .replace(/%name%/g, l.name)
               .replace(/%id%/g, l.id)
               .replace(/%selected%/g, selectedAttr);
         });
         return html;
      } else {
         return [];
      }
   }
);

// Translate text that our Translate.js cannot
// ex: {{L 'text'}}
Template7.registerHelper("L", (text) => {
   return window.t(text);
});

// Helper to get the translated value of a field that was a select list
// ex: {{listItem 'app' 'obj' 'item' selected}}
Template7.registerHelper("translate", (appID, obj, item) => {
   const app = getAppPage().getApplicationByID(appID);
   // var thisApp = Applications.filter((x) => {
   //    return (x.id = app);
   // })[0];

   var lang = app.application.languageDefault();

   if (!obj || !obj.translations || !obj.translations.length) return "";

   var translated = "";

   obj.translations.forEach((t) => {
      if (t.language_code == lang && typeof t[item] != "undefined") {
         translated = t[item];
      }
   });

   return translated;
});

// create a helper in template7 so we can properly display numbers with commas
Template7.registerHelper("commas", (parent, field) => {
   var number = field ? parent[field] : parent;
   if (number === undefined || number === null) {
      return "0";
   }
   return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
});

Template7.registerHelper("cities", (cities, selected) => {
   var html = "";
   cities.forEach((city) => {
      var selectedHTML = city.uuid == selected ? "selected='selected'" : "";
      html += `<option ${selectedHTML} value="${city.uuid}">${city["City Name"]}</option>`;
   });
   return html;
});
