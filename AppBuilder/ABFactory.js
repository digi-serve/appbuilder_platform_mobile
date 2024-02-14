import { cloneDeep } from "lodash";
import moment from "moment";
import { v4 as uuidv4 } from "uuid";

import ABFactoryCore from "./core/ABFactoryCore";
import analytics from "../resources/Analytics.js";
import account from "../resources/Account.js";
import network from "../resources/Network.js";
import { storage } from "../resources/Storage.js";
import { translate } from "../resources/Translate.js";

export default class ABFactory extends ABFactoryCore {
   constructor(...args) {
      super(...args);
      this.analytics = analytics;
      this.account = account;
      this.network = network;
      this.storage = storage;
      this.translate = translate;

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

      // Setup a listener for this Object to catch updates from the relay
      this.network.on("object", async (context, data) => {
         if (context.error != null) {
            context.callback?.(context.error);
            this.AB.analytics.logError(error);
            return;
         }
         const obj = this.datacollections(
            (datacollection) => datacollection.datasource.id === context.id,
         )[0]?.datasource;
         if (obj == null) {
            context.callback?.(new Error(data));
            this.AB.analytics.logError(data);
            return;
         }
         if (obj.name != null) {
            console.log(":: name:", obj.name, {
               ":: context:": context,
               ":: data:": data,
            });
         } else {
            console.log(":: context", context, {
               ":: data": data,
            });
         }
         switch (context.verb) {
            case "create":
               // we are being alerted of a NEW object instance.
               // this might come as a result of our own local().create()
               // or the server might initiate a push of new data.

               // if data does not already exist locally create it
               await obj.model().local().syncRemoteMaster(data);
               // alert any DataCollections that are using this
               // object that there might be new data for them to
               // use.
               obj.emit("CREATE", data);
               break;
            case "update":
               // we are being alerted of UPDATED data from the server.

               // response can be in format:
               // {
               //     status:"success",
               //     data:{ data obj }
               // }
               // if this is a response to one of our .updates()
               if (context.jobID) {
                  // Where is `latestUpdates` set?
                  // @see ABModelRelay.js maybe?
                  if (obj.latestUpdates == null) {
                     context.callback?.(new Error(data));
                     this.AB.analytics.logError(data);
                     return;
                  }
                  // if this is the last update we sent for this object
                  else if (context.jobID !== obj.latestUpdates[data.uuid]) {
                     context.callback?.(new Error(data));
                     this.AB.analytics.logError(data);
                     return;
                  } else delete obj.latestUpdates[data.uuid];
               }
               if (data == null) {
                  context.callback?.(new Error(data));
                  this.AB.analytics.logError(data);
               }
               if (data.status && data.status == "success") {
                  data = data.data || data;
               }
               const modelLocal = obj.model().local();

               // if data does not already exist locally ignore it
               if (await modelLocal.doesExist(data)) {
                  await obj
                     .model()
                     .local()
                     // .syncLocalMaster(data) // ! changing this to remoteMaster
                     // ! the whole point of the UPDATE is to push an overruling change
                     .syncRemoteMaster(data);

                  // alert any DataCollections that are using this
                  // object that there might be new data for them to
                  // use.
                  obj.emit("UPDATE", data);
               }
               break;
            case "delete":
               // we are being alerted of DELETED data from the server.

               // if we initiated this process, and this is a response,
               // then data should look like:
               // {
               //     numRows: #
               // }

               // this was a successful delete,
               // alert our Datacollections:
               if (data.numRows && data.numRows > 0)
                  obj.emit("DELETE", context.pk);

               /*
                     // if data already exists locally, we delete it
                     this.model().local().doesExist(data)
                     .then((exists)=>{
                           if (exists) {


                              // if the context provides the .pk value,
                              // use that to perform the local delete:
                              var id = data[context.pk];
                              if (!id) {

                                 // otherwise attempt to gather it from the
                                 // data itself:
                                 var UUID = this.fieldUUID(data);
                                 id = data[UUID];
                              }
                              
                              if (id) {
                                 this.model().local().localStorageDestroy(id)
                                 .then(()=>{
                                       // alert any DataCollections that are using this 
                                       // object that they should remove this entry:
                                       this.emit("DELETE", data);
                                 })
                              } else {
                                 console.error("ABObject.Relay.on: Delete: could not determine .id", { context:context, UUID:UUID, data:data })
                              }
                           }
                     })
                     */
               break;
            default:
               // TODO: Legacy: remove this once Events and Profile are upgraded.
               obj.emit("data", data);
               break;
         }
         const callbackResult = context.callback?.(null, data);
         if (callbackResult instanceof Promise) await callbackResult;
      });

      // Setup a listener for this DC to catch updates from the relay
      this.network.on("datacollection", async (context, data) => {
         if (context.error != null) {
            context.callback?.(context.error);
            this.AB.analytics.logError(context.error);
            return;
         }
         const dc = this.datacollections(
            (datacollection) => datacollection.id === context.id,
         )[0];
         if (dc == null) return;
         if (dc.name) {
            console.log(":: name:", dc.name, {
               ":: context:": context,
               ":: data:": data,
            });
         } else {
            console.log(":: context", context, {
               ":: data": data,
            });
         }

         // if context is from a "uninitialized" state
         //    OR this datacollection is a Server Centric set of data:
         //    OR this is a Query based datacollection
         const isServerPreferred = dc.isServerPreferred();
         const normalizedData =
            context.verb === "uninitialized" ||
            isServerPreferred ||
            dc.settings.isQuery
               ? await dc.datasource.model().local().syncRemoteMaster(data)
               : await dc.datasource.model().local().syncLocalMaster(data);
         if (isServerPreferred) dc.reduceCondition(normalizedData);
         dc.processIncomingData(normalizedData);
         if (context.verb !== "uninitialized") dc.emit("REFRESH");

         // signal our remote data has arrived.
         dc.emit("init.remote", {});

         // TODO: Legacy: remove this once Events and HRIS are upgraded
         dc.emit("data", normalizedData);
         const callbackResult = context.callback?.(null, data);
         if (callbackResult instanceof Promise) await callbackResult;
      });
   }

   cloneDeep(...args) {
      return cloneDeep(...args);
   }

   notify(...args) {
      console.warn("TODO: AB.notify");
      console.log(...args);
   }

   uuid() {
      return uuidv4();
   }
}
