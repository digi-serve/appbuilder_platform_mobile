/*
 * NetworkRest.js
 * The base Networking class.  This class is responsible for job submissions
 * and outlines the basic Network interface.
 */

/* global navigator Connection */
import account from "./Account";
import analytics from "./Analytics";
import EventEmitter from "eventemitter2";
import Lock from "./Lock";
import Log from "./Log";
import { storage } from "./Storage";
import uuidv4 from "uuid/v4";

var config = require("../../config/config.js");

class NetworkRest extends EventEmitter {
   constructor() {
      super({
         wildcard: true,
         newListener: false,
         maxListeners: 0
      });

      this.baseURL = null;
      this.queueLock = new Lock();
   }

   /**
    * @method init
    * @param {object} options
    * @param {string} options.baseURL
    * @return {Promise}
    */
   init(options) {
      if (options) {
         this.baseURL = options.baseURL || config.appbuilder.urlCoreServer;
      }
      return Promise.resolve();
   }

   //
   // Interface API
   //
   /**
    * Network.get(options, jobResponse)
    * perform a GET request back to the AppBuilder server.
    * @param {obj} params the request parameters that need to be executed on
    *              the AppBuilder Server
    * @param {obj} jobResponse the callback info for handling the response.
    *              {
    *                  key:'unique.key',
    *                  context:{ obj data }
    *              }
    * @return {Promise}
    */
   get(params, jobResponse) {
      params.type = params.type || "GET";
      return this._request(params, jobResponse).then((response) => {
         if (jobResponse) {
            this.publishResponse(jobResponse, response);
         }
         return response;
      });
   }

   /**
    * Network.post()
    * perform an AJAX POST request to the AppBuilder server.
    * @param {obj} params the request parameters that need to be executed on
    *              the AppBuilder Server
    * @param {obj} jobResponse the callback info for handling the response.
    *              {
    *                  key:'unique.key',
    *                  context:{ obj data }
    *              }
    * @return {Promise}
    */
   post(params, jobResponse) {
      params.type = params.type || "POST";
      return this._request(params, jobResponse).then((response) => {
         if (jobResponse) {
            this.publishResponse(jobResponse, response);
         }
         if (response.status != "success") {
            this.queue(params, jobResponse);
         }
         return response;
      });
   }

   /**
    * Network.put()
    * perform a PUT request to the AppBuilder server.
    * @param {obj} params the request parameters that need to be executed on
    *              the AppBuilder Server
    * @param {obj} jobResponse the callback info for handling the response.
    *              {
    *                  key:'unique.key',
    *                  context:{ obj data }
    *              }
    * @return {Promise}
    */
   put(params, jobResponse) {
      params.type = params.type || "PUT";
      return this._request(params, jobResponse).then((response) => {
         if (jobResponse) {
            this.publishResponse(jobResponse, response);
         }
         if (response.status != "success") {
            this.queue(params, jobResponse);
         }
         return response;
      });
   }

   /**
    * Network.delete()
    * perform an AJAX DELETE request to the AppBuilder server.
    * @param {obj} params the request parameters that need to be executed on
    *              the AppBuilder Server
    * @param {obj} jobResponse the callback info for handling the response.
    *              {
    *                  key:'unique.key',
    *                  context:{ obj data }
    *              }
    * @return {Promise}
    */
   delete(params, jobResponse) {
      params.type = params.type || "DELETE";
      return this._request(params, jobResponse).then((response) => {
         if (jobResponse) {
            this.publishResponse(jobResponse, response);
         }

         if (response.status != "success") {
            this.queue(params, jobResponse);
         }
         return response;
      });
   }

   ////
   //// Network Utilities
   ////

   /**
    * @method networkStatus
    * return the connection type currently registered with the network
    * plugin.
    * @return {string}
    */
   networkStatus() {
      return navigator.connection.type;
   }

   /**
    * @method isNetworkConnected
    * return true/false if the device is currently connected to the
    * internet.
    * @return {bool}
    */
   isNetworkConnected() {
      // lets try some unorthodox methods to determine if we are connected
      if (navigator.onLine === false) {
         return false;
      }
      // if ("connection" in navigator) {
      //    const connection = navigator.connection ||
      //       navigator.mozConnection ||
      //       navigator.webkitConnection || { type: "none" };

      //    return connection.type !== "none";
      // }
      else {
         // Handle cases where the API is not supported (e.g., desktop browsers)
         return navigator.onLine;
      }
   }

   /**
    * _request()
    * perform the actual AJAX request for this operation.
    * @param {obj} params  the jQuery.ajax() formatted params
    * @param {obj} jobRequest  the information about the request's response.
    * @param {integer} numRetries Number of times to retry a failed request
    * @return {Promise}
    */
   _request(params, jobResponse, numRetries=1) {
      return new Promise((resolve, reject) => {
         params.url = params.url || "/";
         if (params.url[0] == "/") {
            params.url = this.baseURL + params.url;
         }

         params.headers = params.headers || {};
         params.headers.Authorization = params.headers.Authorization || account.authToken;
         // params.timeout = params.timeout || 6000;

         if (this.isNetworkConnected()) {
            $.ajax(params)
               .done((packet) => {
                  // Log('--- .done():', packet);
                  // the returned data packet should look like:
                  // {
                  //  status:'success',
                  //  data:{returned Data here}
                  // }
                  // we just want to return the .data portion
                  var data = packet;
                  if (data.data) data = data.data;
                  resolve(data);
               })
               .fail((jqXHR, text, err) => {
                  // if this is a network connection error, send the attempt again:
                  if (text == "timeout" || jqXHR.readyState == 0) {
                     //// Network Error: conneciton refused, access denied, etc...
                     Log(
                        "*** NetworkRest._request():network connection error detected."
                     );
                     analytics.log(
                        "NetworkRest._request():network connection error detected."
                     );
                     // retry the attempt:
                     if (numRetries > 0) {
                        Log("Trying again");
                        this._request(params, jobResponse, numRetries-1)
                           .then((data) => {
                              Log.warn(
                                 "*** NetworkRest._request().then(): attempt resolved."
                              );
                              resolve(data);
                           })
                           .catch((err) => {
                              Log.error(
                                 "*** NetworkRest._request().catch(): retry failed:",
                              );
                              reject(err);
                           });
                        return;
                     } else {
                        // no more retries left
                        // should we emit an offline event here?
                        // should packet at issue be reported?
                        this.emit("offline");
                        // reject() will be called below
                     }
                  } else if (jqXHR.readyState == 4) {
                     //// an HTTP error
                     Log("HTTP error while communicating with relay server");
                     Log("status code: " + jqXHR.status);

                     if (jqXHR.status == 403) {
                        this.emit("error.badAuth", err);
                     } else if (jqXHR.status >= 400 && jqXHR.status < 500) {
                        this.emit("error.badRequest", err);
                     } else if (jqXHR.status >= 500) {
                        this.emit("error.badServer", err);
                     }
                  }

                  // Maybe we lost the connection mid-send
                  if (!this.isNetworkConnected()) {
                     // add it to the queue and retry later
                     this.queue(params, jobResponse);
                     let error = new Error(
                        "Network error: adding to queue for later retry."
                     );
                     reject(error);
                  } else {
                     let error = new Error(
                        "NetworkRest._request() error with .ajax() command:"
                     );
                     error.response = jqXHR.responseText;
                  error.text = text;
                  error.err = err;
                  error.code = jqXHR.status;
                  analytics.logError(error);
                  Log.error(error);
                     // TODO: insert some default error handling for expected
                     // situations:
                     reject(error);
                  }
               });
         } else {
            // Network is not connected
            // now Queue this request params.
            analytics.log(
               "NetworkRest:_request(): Network is offline. Queuing request."
            );
            this.queue(params, jobResponse)
               .then(() => {
                  resolve({ status: "queued" });
               })
               .catch(reject);
         }
      });
   }

   /**
    * _resend()
    * processes messages that were queued due to network connectivity
    * issues.
    * @param {obj} params  the jQuery.ajax() formatted params
    * @param {obj} jobRequest  the information about the request's response.
    * @return {Promise}
    */
   _resend(params, jobResponse) {
      var op = params.type.toLowerCase();
      return this[op](params, jobResponse);
   }

   /**
    * publishResponse()
    * emit the requested response for this network operation.
    * @param {obj} jobResponse
    * @param {obj} data
    */
   publishResponse(jobResponse, data) {
      this.emit(jobResponse.key, jobResponse.context, data);
   }

   ////
   //// Queued Requests
   ////

   /**
    * refQueue()
    * sub classes can override this for their own separate Queue Data
    * @return {string}
    */
   refQueue() {
      return "networkQueue";
   }

   /**
    * Adds a request to the outgoing queue.
    *
    * @param {object} data
    * @param {object} jobResponse
    * @return {Promise}
    */
   queue(data, jobResponse) {
      var refQueue = this.refQueue();

      return new Promise((resolve, reject) => {
         this.queueLock
            .acquire()
            .then(() => {
               return storage.get(refQueue);
            })
            .then((queue) => {
               queue = queue || [];
               queue.push({ data, jobResponse });
               Log(
                  `:::: ${queue.length} request${
                     queue.length > 1 ? "s" : ""
                  } queued`
               );
               return storage.set(refQueue, queue);
            })
            .then(() => {
               this.emit("queued");
               this.queueLock.release();
               resolve();
            })
            .catch((err) => {
               Log.error("Error while queueing data", err);
               analytics.logError(err);
               reject(err);

               // this may be undefined?
               this.queueLock?.release();
            });
      });
   }

   /**
    * queueFlush()
    * Flush the queue and send the contents to the relay server.
    */
   queueFlush() {
      var refQueue = this.refQueue();

      // if we are not connected, then stop
      if (!this.isNetworkConnected()) {
         var error = new Error("Not connected to the internet.");
         error.code = "E_NOTCONNECTED";
         return Promise.reject(error);
      }

      // otherwise, attempt to flush the queue:
      return new Promise((resolve, reject) => {
         this.queueLock
            .acquire()

            //
            // Get queue contents
            //
            .then(() => {
               return storage.get(refQueue);
            })

            //
            // Send off each queued request
            //
            .then((queue) => {
               // default to [] if not found
               queue = queue || [];

               // recursively process each pending queue request
               var processRequest = (cb) => {
                  if (queue.length == 0) {
                     cb();
                  } else {
                     var entry = queue.shift();
                     var params = entry.data;
                     var job = entry.jobResponse;
                     this._resend(params, job)
                        .then(() => {
                           processRequest(cb);
                        })
                        .catch(cb);
                  }
               };

               return new Promise((res, rej) => {
                  processRequest((err) => {
                     if (err) {
                        rej(err);
                     } else {
                        res();
                     }
                  });
               });
            })

            //
            // Clear queue contents
            //
            .then(() => {
               return storage.set(refQueue, []);
            })

            // release the Lock
            .then(() => {
               // this.emit('synced');
               return this.queueLock.release();
            })

            // all done.
            .then(() => {
               resolve();
            })

            // respond to errors:
            .catch((err) => {
               Log.error("commAPI queueFlush error", err);
               analytics.logError(err);

               if (this.queueLock){
                  this.queueLock?.release().then(() => {
                     reject(err);
                  });
               } else {
                  console.error("queueLock is undefined");
                  reject(err);
               }
            });
      });
   }

   /**
    * Reset credentials to a blank state.
    *
    * @return {Promise}
    */
   reset() {
      return Promise.resolve();
   }

   uuid() {
      return uuidv4();
   }

   getTokens() {
      // called in appPage.js : openRelayLoader()
      return {};
   }
}

export default NetworkRest;
