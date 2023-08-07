import { cloneDeep } from "lodash";
import moment from "moment";

import ABFactoryCore from "./core/ABFactoryCore";

export default class ABFactory extends ABFactoryCore {
   constructor(...args) {
      super(...args);
      //
      // Rules
      //
      const platformRules = {
         /**
          * @method toDate
          *
          * @param {string} dateText
          * @param {Object} options - {
          *                               format: "string",
          *                               ignoreTime: boolean
          *                            }
          * @return {Date}
          */
         toDate: (dateText = "", options = {}) => {
            if (!dateText) return;

            if (options.ignoreTime) dateText = dateText.replace(/T.*/, "");

            let result = options.format
               ? moment(dateText, options.format)
               : moment(dateText);

            let supportFormats = [
               "YYYY-MM-DD",
               "YYYY/MM/DD",
               "DD/MM/YYYY",
               "MM/DD/YYYY",
               "DD-MM-YYYY",
               "MM-DD-YYYY",
            ];

            supportFormats.forEach((format) => {
               if (!result || !result.isValid())
                  result = moment(dateText, format);
            });

            return new Date(result);
         },

         /**
          * @method toDateFormat
          *
          * @param {Date} date
          * @param {Object} options - {
          *           format: "string",
          *           localeCode: "string"
          *         }
          *
          * @return {string}
          */
         toDateFormat: (date, options) => {
            if (!date) return "";

            let momentObj = moment(date);

            if (options.localeCode) momentObj.locale(options.localeCode);

            return momentObj.format(options.format);
         },

         /**
          * @method subtractDate
          *
          * @param {Date} date
          * @param {number} number
          * @param {string} unit
          *
          * @return {Date}
          */
         subtractDate: (date, number, unit) => {
            return moment(date).subtract(number, unit).toDate();
         },

         /**
          * @method addDate
          *
          * @param {Date} date
          * @param {number} number
          * @param {string} unit
          *
          * @return {Date}
          */
         addDate: (date, number, unit) => {
            return moment(date).add(number, unit).toDate();
         },
      };
      (Object.keys(platformRules) || []).forEach((k) => {
         this.rules[k] = platformRules[k];
      });
   }
   cloneDeep(...args) {
      return cloneDeep(...args);
   }

   notify(...args) {
      console.warn("TODO: AB.notify");
      console.log(...args);
   }
}
