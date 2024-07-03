/*
 * Network.js
 * A network manager for interfacing with our AppBuilder server.
 */
"use strict";

import EventEmitter from "eventemitter2";
import CryptoJS from "crypto-js";

const config = require("../../config/config.js");

/*
 * NetworkRest.js
 * The base Networking class.  This class is responsible for job submissions
 * and outlines the basic Network interface.
 */
class NetworkRest extends EventEmitter {
   constructor() {
      super({
         wildcard: true,
         newListener: false,
         maxListeners: 0,
      });
      this._authToken = null;
      this._lock = null;
      this._baseURL = null;
      this.app = null;
   }

   /**
    * Adds a request to the outgoing queue.
    *
    * @param {object} data
    * @param {object} jobResponse
    * @return {Promise}
    */
   async _queue(data, jobResponse) {
      const refQueue = this.refQueue;
      if (data.url.includes("/mobile/register")) {
         console.error("Queueing a QR scan doesn't seem to work...", data);
         return;
      }
      const lock = this._lock;
      try {
         await lock.acquire();
         const storage = this.app.resources.storage;
         const queue = (await storage.get("user", refQueue)) || [];
         queue.push({ data, jobResponse });
         console.log(
            `:::: ${queue.length} request${queue.length > 1 ? "s" : ""} queued`
         );
         await storage.set("user", refQueue, queue);
         lock.release();
      } catch (err) {
         lock.release();
         throw err;
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
   async _request(params, jobResponse, numRetries = 1) {
      params.url = params.url || "/";
      if (params.url[0] === "/") params.url = this._baseURL + params.url;
      params.headers = params.headers || {};
      params.headers.Authorization =
         params.headers.Authorization || this._authToken;
      // params.timeout = params.timeout || 6000;
      if (!navigator.onLine) {
         await this._queue(params, jobResponse);
         return { status: "queued" };
      }
      return await new Promise((resolve, reject) => {
         $.ajax(params)
            .done((packet) => {
               // Log('--- .done():', packet);
               // the returned data packet should look like:
               // {
               //  status:'success',
               //  data:{returned Data here}
               // }
               // we just want to return the .data portion
               resolve(packet);
            })
            .fail(async (jqXHR, text, err) => {
               // if this is a network connection error, send the attempt again:
               if (text === "timeout" || jqXHR.readyState === 0) {
                  //// Network Error: conneciton refused, access denied, etc...
                  console.error(
                     "*** NetworkRest._request():network connection error detected."
                  );
                  // retry the attempt:
                  if (numRetries > 0) {
                     console.error("Trying again");
                     try {
                        resolve(
                           await this._request(
                              params,
                              jobResponse,
                              numRetries - 1
                           )
                        );
                     } catch (err) {
                        reject(err);
                     }
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
                  console.error(
                     "HTTP error while communicating with relay server"
                  );
                  console.error(`status code: ${jqXHR.status}`);
               }

               // Maybe we lost the connection mid-send
               if (!navigator.onLine) {
                  // add it to the queue and retry later
                  this._queue(params, jobResponse);
                  let error = new Error(
                     "Network error: adding to queue for later retry."
                  );
                  resolve({ status: "queued" });
                  return;
               }

               const error = new Error(
                  "NetworkRest._request() error with .ajax() command:"
               );
               error.response = jqXHR.responseText;
               error.text = text;
               error.err = err;
               error.code = jqXHR.status;
               error.message = `${error.message}NetworkRest._request() error with .ajax() command: ${params.url}`;
               console.error(error);

               // reject with error as that is the expected behavior while the relay server is UP
               // may trigger a retry somewhere else
               reject(error);
            });
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
      const op = params.type.toLowerCase();
      return this[op](params, jobResponse);
   }

   /**
    * @method init
    * @return {Promise}
    */
   async init(app) {
      this.app = app;
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
   async get(params, jobResponse) {
      params.type = params.type || "GET";
      const response = await this._request(params, jobResponse);
      response.status !== "success" && (await this._queue(params, jobResponse));

      // Public response.
      jobResponse != null &&
         this.emit(jobResponse.key, jobResponse.context, response);
      return response;
   }

   /**
    * Network.post()
    * perform an AJAX POST request to the AppBuilder server.
    * @param {obj} params the request parameters that need to be executed on
    *              the AppBuilder Server
    * @param {obj} jobResponse the callback info for handling the response.
    * @param {default true boolean} queue if true
    *              {
    *                  key:'unique.key',
    *                  context:{ obj data }
    *              }
    * @return {Promise}
    */
   async post(params, jobResponse, queue = true) {
      params.type = params.type || "POST";
      const response = await this._request(params, jobResponse);
      response.status !== "success" &&
         queue &&
         (await this._queue(params, jobResponse));

      // Public response.
      jobResponse != null &&
         this.emit(jobResponse.key, jobResponse.context, response);
      return response;
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
   async put(params, jobResponse) {
      params.type = params.type || "PUT";
      const response = await this._request(params, jobResponse);
      response.status !== "success" && (await this._queue(params, jobResponse));

      // Public response.
      jobResponse != null &&
         this.emit(jobResponse.key, jobResponse.context, response);
      return response;
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
   async delete(params, jobResponse) {
      params.type = params.type || "DELETE";
      const response = await this._request(params, jobResponse);
      response.status !== "success" && (await this._queue(params, jobResponse));

      // Public response.
      jobResponse != null &&
         this.emit(jobResponse.key, jobResponse.context, response);
      return response;
   }

   /**
    * queueFlush()
    * Flush the queue and send the contents to the relay server.
    */
   async queueFlush() {
      const refQueue = this.refQueue;

      // if we are not connected, then stop
      if (!navigator.onLine) {
         const error = new Error("Not connected to the internet.");
         error.code = "E_NOTCONNECTED";
         throw error;
      }
      const lock = this._lock;
      try {
         await lock.acquire();
         const storage = this.app.resources.storage;
         const queue = (await storage.get("user", refQueue)) || [];

         // recursively process each pending queue request
         const processRequest = async (callback) => {
            if (queue.length == 0) {
               callback();
               return;
            }
            const entry = queue.shift();
            const params = entry.data;

            // temporarily search the queue for mobile/register
            // and skip it if found
            // TODO remove this when users don't have to scan QR from within app
            if (params.url.includes("/mobile/register")) return;
            const job = entry.jobResponse;
            try {
               await this._resend(params, job);
               await processRequest(callback);
            } catch (err) {
               callback(err);
            }
         };
         await new Promise((resolve, reject) => {
            processRequest((err) => {
               (err != null && reject(err)) || resolve();
            });
         });
         await storage.set("user", refQueue, []);
         lock.release();
      } catch (err) {
         lock.release();
         throw err;
      }
   }

   /**
    * Reset credentials to a blank state.
    *
    * @return {Promise}
    */
   async reset() {}

   get baseURL() {
      return this._baseURL;
   }

   set baseURL(value) {
      this._baseURL = value;
   }

   get lock() {
      return this._lock;
   }

   set lock(value) {
      this._lock = value;
   }

   /**
    * sub classes can override this for their own separate Queue Data
    * @return {string}
    */
   get refQueue() {
      return "networkQueue";
   }
}

/*
 * NetworkRelay.js
 * An implementation of our Netork object that sends it's data across our
 * encrypted relay server.
 */
const MAX_PACKET_SIZE = config.appbuilder.maxPacketSize || 1048576;
const MAX_JOB_AGE = config.appbuilder.maxJobAge || 1000 * 60 * 60 * 24 * 7; // 7 days
class NetworkRelay extends NetworkRest {
   /**
    * Generate random bytes in hex format.
    *
    * @param {integer} [numBytes]
    *      32 bytes for AES 256 key (default).
    *      16 bytes for IV.
    *
    * @return {string}
    **/
   static randomBytes(numBytes = 32) {
      // browser WebCrypto for secure random number generator
      const numbers = new Uint8Array(numBytes);
      // Note: window.crypto != CryptoJS
      crypto.getRandomValues(numbers); // 0 to 255

      // convert numbers to hex string
      let hexString = "";
      numbers.forEach((num) => {
         const h = num.toString(16); // '0' to 'ff'
         if (h.length == 1) {
            hexString += "0" + h; // left pad with '0' if needed
         } else {
            hexString += h;
         }
      });
      return hexString;
   }

   constructor() {
      super();
      this._appUUID = null;
      this._importInProgress = false;
      this._isPolling = false;

      // TODO (Guy): Storage won't save string encryption for callback functions. I will fix it later.
      this._jobResponses = {};
      this._relayRequestRoute = null;
      this._relayState = null;
      this._tenantUUID = null;
      document.addEventListener(
         "offline",
         () => {
            // trigger an 'online' event
            this.emit("offline");
         },
         false
      );
      document.addEventListener(
         "online",
         async () => {
            // make sure we are properly initialized
            // NOTE: should not be a problem to call even after we have
            // .init() before.
            await this.init(this.app);

            // now flush our pending requests
            await this.queueFlush();

            // trigger an 'online' event
            this.emit("online");
         },
         false
      );
      this.on(this.defaultEventKeys.offline, () => {
         // TODO (Guy):
      });
      this.on(this.defaultEventKeys.online, async () => {
         // TODO (Guy):
      });
      this.on(this.defaultEventKeys.callback, (context, res) => {
         let instance = this.app;
         console.assert(context, `no context${context}`)
         const targetEventPath = context.targetEventPath;
         if (targetEventPath != null) {
            const pathKeys = targetEventPath.split(".");
            for (const pathKey of pathKeys) {
               if (Array.isArray(instance)) {
                  const [objKey, objValue] = pathKey.split("=");
                  instance = instance.find(
                     (e) => e instanceof Object && e[objKey] === objValue
                  );
               } else instance = instance[pathKey];
               if (instance == null) return;
            }
            if (!(instance instanceof EventEmitter)) return;
         }
         instance.emit(context.targetEventKey, context, res, instance);
      });
   }

   /**
    * All our Relay requests simply create jobs on the Relay server to
    * complete. This fn() packages our jobs and creates them on the Relay
    * Server.
    * @param {obj} params the request parameters that need to be executed on
    *              the Core Server
    * @param {obj} jobResponse the callback info for handling the response.
    *              {
    *                  key:'unique.key',
    *                  context:{ obj data }
    *              }
    * @return {Promise}
    **/
   async _createJob(params, jobResponse) {
      if (this._authToken == null) return;

      params.headers = params.header || {};
      params.headers["tenant-token"] = this._tenantUUID;

      // ok, the given params, are the DATA we want to send to the RelayServer
      let data = this._encrypt(params);
      const mccRes = [];
      const lock = this._lock;
      try {
         await lock.acquire();
         const app = this.app;
         const storage = app.resources.storage;
         const jobToken = app.utils.uuidv4();
         const jobResponses =
            this._jobResponses ||
            (await storage.get("user", "jobResponse")) ||
            {};

         // add our jobToken to the local data:
         jobResponses[jobToken] = jobResponse;
         await storage.set("user", "jobResponse", jobResponses);
         lock.release();

         // Split up large data into smaller packets
         const packets = [];
         while (data.length >= MAX_PACKET_SIZE) {
            packets.push(data.slice(0, MAX_PACKET_SIZE));
            data = data.slice(MAX_PACKET_SIZE, data.length);
         }
         packets.push(data);

         // we are Creating a new relay entry, so we do a POST
         // Can't just pass in a prepared `relayParams` object here
         // because its contents can change by the time the post is
         // being sent.
         for (let i = 0; i < packets.length; i++)
            mccRes.push(
               await super.post({
                  url: this._relayRequestRoute,
                  data: {
                     tenantUUID: this._tenantUUID,
                     appUUID: this._appUUID,
                     jobToken,
                     packet: i,
                     totalPackets: packets.length,
                     data: packets[i],
                     tenant: config.appbuilder.tenantUUID,
                  },
               })
            );
         return mccRes;
      } catch (err) {
         mccRes.push(err);
         lock.release();
         throw mccRes;
      }
   }

   /**
    * return a javascript obj that represents the data that was encrypted
    * using our AES key.
    * @param {string} data
    * @return {obj}
    **/
   _decrypt(data) {
      if (typeof data !== "string" || !data.match(":::")) return "";
      const dataParts = data.split(":::");

      // Decrypt AES
      try {
         const decrypted = CryptoJS.AES.decrypt(
            dataParts[0],
            CryptoJS.enc.Hex.parse(this._relayState.aesKey),
            { iv: CryptoJS.enc.Hex.parse(dataParts[1]) }
         );

         // Parse JSON to plantext.
         return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
      } catch (err) {
         console.error("Error decrypting incoming relay data", data, err);
         return data;
      }
   }

   /**
    * return an AES encrypted blob of the stringified representation of the given
    * data.
    * @param {obj} data
    * @return {string}
    **/
   _encrypt(data) {
      const aesKey = this._relayState.aesKey;
      if (data == null || aesKey == null) return "";
      const iv = NetworkRelay.randomBytes(16);
      return `${CryptoJS.AES.encrypt(
         JSON.stringify(data),
         CryptoJS.enc.Hex.parse(aesKey),
         { iv: CryptoJS.enc.Hex.parse(iv) }
      ).toString()}:::${iv}`;
   }

   /**
    * Load the necessary network data.
    **/
   async _loadNetworkData() {
      const lock = this.lock;
      try {
         await lock.acquire();
         const app = this.app;
         const rsa = new app.utils.JSEncrypt();
         const storage = app.resources.storage;
         await Promise.all([
            (async () => {
               const jobResponses = await storage.get("user", "jobResponse");
               if (jobResponses != null) {
                  this._jobResponses = jobResponses;
                  return;
               }
               await storage.set("user", "jobResponse", {});
               this._jobResponses = {};
            })(),
            (async () => {
               const relayState = (await storage.get("user", "relayState")) || {
                  aesKey: null,
                  aesKeySent: false,
                  lastSyncDate: null,
               };
               if (relayState.aesKey != null) {
                  this._relayState = relayState;
                  return;
               }

               // Generate AES key now.debugger
               relayState.aesKey = NetworkRelay.randomBytes(32);
               relayState.aesKeySent = false;
               await storage.set("user", "relayState", relayState);
               this._relayState = relayState;
            })(),
            (async () => {
               let appUUID = await storage.get("user", "appUUID");
               if (appUUID == null) {
                  appUUID = app.utils.uuidv4();
                  await storage.set("user", "appUUID", appUUID);
               }
               this._appUUID = appUUID;
            })(),
            (async () => {
               let tenantUUID = await storage.get("user", "tenantUUID");
               if (tenantUUID == null) {
                  tenantUUID = config.appbuilder.tenantUUID;
                  await storage.set("user", "tenantUUID", tenantUUID);
               }
               this._tenantUUID = tenantUUID;
            })(),
            (async () => {
               const rsaPublicKey = await storage.get("user", "rsaPublicKey");
               if (rsaPublicKey != null && rsaPublicKey.length > 50) return;

               // have we done our initial /mobile/init and gotten an RSA key?
               console.log("NetworkRelay: init stage 4");
               console.log("..fetching RSA public key from server");
               const data = (
                  await super.get({
                     url: config.appbuilder.routes.mobileInit, // "/mobile/init",
                     data: {
                        appID: config.appbuilder.maID,
                     },
                  })
               ).data;

               // go ahead and save these values:
               await Promise.all([
                  storage.set("user", "uuid", data.userUUID),
                  storage.set("user", "rsaPublicKey", data.rsaPublic),
                  storage.set("user", "appPolicy", data.appPolicy),
               ]);
            })(),
         ]);
         rsa.setKey(await storage.get("user", "rsaPublicKey"));
         const relayState = this._relayState;
         if (relayState.aesKeySent) {
            lock.release();
            return;
         }

         // prevent offline attempt.
         if (!navigator.onLine)
            throw new Error(
               "NetworkRelay:init(): prevent initresolve when no network conencted."
            );

         // NOTE: use super.post() here so we don't do our .post()
         // which encrypts the data with AES ...
         await super.post({
            url: config.appbuilder.routes.mobileInitResolve,
            data: {
               rsa_aes: rsa.encrypt(
                  JSON.stringify({
                     aesKey: relayState.aesKey,
                  })
               ),
               userUUID: await storage.get("user", "uuid"),
               appID: config.appbuilder.maID,
               appUUID: this._appUUID,
               tenantUUID: this._tenantUUID,
            },
         });
         relayState.aesKeySent = true;
         await storage.set("user", "relayState", relayState);
         lock.release();
      } catch (err) {
         lock.release();
         throw err;
      }
   }

   /**
    * NetworkRelay._poll()
    * initiate a poll to the Public Relay Server to see if there are any
    * responses for us:
    */
   async _poll(frequency) {
      // only start the polling loop 1x:
      if (this._isPolling) return;
      const checkIn = async () => {
         // if we are ready to talk to MCC:
         const relayState = this._relayState;
         if (
            relayState == null ||
            !relayState.aesKeySent ||
            !navigator.onLine
         ) {
            // else try again later:
            this.pollTimerID = setTimeout(checkIn, frequency);
            return;
         }

         // take a given response packet back from the server and ...
         // you know ... process it.
         const data =
            (
               await super.get({
                  url: this._relayRequestRoute,
                  data: { appUUID: this._appUUID },
               })
            ).data || [];
         const lock = this._lock;
         try {
            await lock.acquire();
            const storage = this.app.resources.storage;
            /**
             * take the response from the Public Relay Server, and publish it to
             * the jobResponse that was requested for it.
             * @param {obj} response  the response packet from the server:
             *              {
             *                  appUUID: {string},
             *                  data: {string},  encrypted data
             *                  jobToken: {string}
             *              }
             * @response {Promise}
             **/
            const resolveJob = async (response) => {
               const data = this._decrypt(response.data);

               // we expect a fully wrapped data packet back:
               // {
               //  status: "success",
               //  data:[]
               // }

               // find the jobToken
               // trigger the registered .key callback
               const jobResponses =
                  this._jobResponses ||
                  (await storage.get("user", "jobResponse")) ||
                  {};
               const jobResponse = jobResponses[response.jobToken];
               if (jobResponse != null) {
                  this.emit(
                     jobResponse.key || this.defaultEventKeys.callback,
                     jobResponse.context,
                     data
                  );
                  delete jobResponses[response.jobToken];
                  await storage.set("user", "jobResponse", jobResponses);
               } else
                  console.error(
                     "!!! Unknown job token in response packet:",
                     response.jobToken,
                     jobResponses,
                     data
                  );
               delete jobResponses[response.jobToken];
            };
            const saveJobPackets = async (packets, timestamps) => {
               // save this back to our storage:
               await storage.set("abRelayJobPackets", packets);

               // update the timestamp info for any new jobs
               for (const token in packets) {
                  if (timestamps[token] != null) continue;
                  timestamps[token] = Date.now();
               }
               await storage.set(
                  "user",
                  "abRelayJobPacketsTimestamps",
                  timestamps
               );
            };

            // The big consideration here is that some packets can be excessivly
            // large (think encrypted images) and need to be split into smaller
            // packets that need to be reassembled.  We reasseble these packets
            // before passing them off to resolveJob()
            await Promise.all(
               data.map(async (e) => {
                  const totalPackets = e.totalPackets;
                  if (totalPackets === 1) {
                     await resolveJob(e);
                     return;
                  }

                  // NOTE: it is possible that while we were waiting for storage.get()
                  // several more calls to getJobPackets() were fired off.  any processing
                  // or alterations to jobPackets inbetween these times would be overwritten
                  // by these new values, so make sure jobPackets are included in this chain:
                  const [jobPackets, jobPacketsTimestamps] = await Promise.all([
                     storage.get("user", "abRelayJobPackets") ||
                        Promise.resolve({}),
                     storage.get("abRelayJobPacketsTimestamps") ||
                        Promise.resolve({}),
                  ]);

                  // Delete packets from jobs that are too old.
                  // These are jobs that were started long ago and never finished.
                  for (const token in jobPacketsTimestamps) {
                     if (
                        Date.now() - jobPacketsTimestamps[token] <=
                        MAX_JOB_AGE
                     )
                        continue;
                     delete jobPackets[token];
                     delete jobPacketsTimestamps[token];
                  }

                  const jobToken = e.jobToken;
                  const packets = (jobPackets[jobToken] =
                     jobPackets[jobToken] || []);
                  packets.push(e);

                  // now if we have a complete set, combine and resolve:
                  if (packets.length < totalPackets) {
                     await saveJobPackets(jobPackets, jobPacketsTimestamps);
                     return;
                  }
                  // not sure what order packets are in so hash them:
                  const hash = {};
                  packets.forEach((p) => {
                     hash[p.packet] = p;
                  });

                  // Sometimes there may be missing packets even in a "complete"
                  // set. Perhaps from some of them being duplicates? Skip the
                  // process if that's the case here.
                  for (let i = 0; i < totalPackets; i++) {
                     if (hash[i] != null) continue;
                     console.warn(
                        `Weird. Missing packet[${i}/${totalPackets - 1}]`,
                        packets.map((p) => p.packet)
                     );

                     // Compare the duplicate packets.
                     let packetNums = new Set();
                     for (let j = 0; j < packets.length; j++) {
                        const p = packets[j];
                        if (!packetNums.has(p.packet)) {
                           packetNums.add(p.packet);
                           continue;
                        }

                        // Found a duplicate packet.
                        let duplicatedPacket = null;
                        for (let k = 0; k < j; k++)
                           if (packets[k].packet === p.packet) {
                              duplicatedPacket = packets[k];
                              break;
                           }
                        if (p.data === duplicatedPacket.data) {
                           console.warn(
                              `Duplicate packets for ${p.packet} are identical`
                           );
                           console.warn("Dropping one of them");
                           packets.splice(j, 1);
                        } else {
                           console.warn(
                              `Duplicate packets for ${p.packet} are different!`
                           );
                           console.warn(
                              `One of them is corrupted. But which one?`
                           );
                           console.warn(
                              "the packet",
                              p.data.substring(0, 20) + "..."
                           );
                           console.warn(
                              "The duplicated packet",
                              duplicatedPacket.data.substring(0, 20) + "..."
                           );
                           console.warn("Dropping the smaller packet");
                           if (p.length < duplicatedPacket.length)
                              packets.splice(j, 1);
                           else packets.splice(k, 1);
                        }
                        break;
                     }

                     // Don't resolve job. Don't remove the packets.
                     // Maybe more packets will come in later to complete the
                     // set.
                     await saveJobPackets(jobPackets, jobPacketsTimestamps);
                     return;
                  }

                  // then pull off 0 -> packets.length
                  let encryptedData = "";
                  for (let i = 0; i < totalPackets; i++)
                     encryptedData += hash[i].data;

                  // we can remove these pending job packets now
                  delete jobPackets[jobToken];
                  await resolveJob({
                     appUUID: e.appUUID,
                     data: encryptedData,
                     jobToken: e.jobToken,
                  });
                  await saveJobPackets(jobPackets, jobPacketsTimestamps);
               })
            );
            lock.release();
         } catch (err) {
            lock.release();
            console.error(err);
         }
         this.pollTimerID = setTimeout(checkIn, frequency);
      };
      checkIn();
      this._isPolling = true;
   }

   /**
    * _resend()
    * processes messages that were queued due to network connectivity
    * issues.  Our initial run would have already converted the params to
    * the encrypted packet and made our jobToken.  So we just try to send
    * it again now.
    * @param {obj} params  the jQuery.ajax() formatted params
    * @return {Promise}
    */
   async _resend(params /*, jobResponse */) {
      await super.post(params);
   }

   /**
    * Early initialization. This can happen even before the auth token is
    * setup.
    *
    * @param {App} app
    *
    * @return {Promise}
    **/
   async init(app) {
      await super.init(app);
      this.lock = new app.utils.Lock();
      this._relayRequestRoute = config.appbuilder.routes.relayRequest;
      this.baseURL = config.appbuilder.urlRelayServer;
      this._poll(config.appbuilder.relayPollFrequencyNormal);
   }

   /**
    * Obtain the pre-token from the URL. And then generate a new authToken.
    *
    * @param {string} preToken
    * @param {string} tenantUUID
    * @return {Promise}
    */
   async importCredentials(preToken, tenantUUID) {
      if (this._importInProgress) {
         console.error("::: importSettings(): already in progress");
         throw new Error("Import already in progress");
      }
      this._importInProgress = true;
      const app = this.app;
      const resources = app.resources;
      const storage = resources.storage;
      try {
         tenantUUID != null &&
            (await storage.set("user", "tenantUUID", tenantUUID));
         if (preToken == null) {
            if (
               (this._authToken ||
                  (this._authToken = await storage.get("user", "authToken"))) ==
               null
            ) {
               const err = new Error("Not found authToken!");
               err.code = "E_BADAUTHTOKEN";
               throw err;
            }
            await this._loadNetworkData();
            return;
         }
         const newAuthToken = NetworkRelay.randomBytes(64);

         // prevent queueing re-attempt, as mobile/register will only work once
         await super.post(
            {
               url: "/mobile/register",
               data: {
                  pre: preToken,
                  new: newAuthToken,
               },
            },
            null,
            false
         );
         await storage.set("user", "authToken", newAuthToken);
         this._authToken = newAuthToken;
         await this._loadNetworkData();
         this._importInProgress = false;
      } catch (err) {
         this._importInProgress = false;
         throw err;
      }
   }

   /**
    * Reset credentials to a blank state.
    *
    * @return {Promise}
    */
   async reset() {
      const app = this.app;
      const storage = app.resources.storage;
      const lock = this.lock;
      try {
         await lock.acquire();
         await Promise.all([
            storage.set("user", "rsaPublicKey", null),
            storage.set("user", "relayState", null),
            storage.set("user", "appUUID", null),
         ]);
         lock.release();
      } catch (err) {
         lock.release();
         throw err;
      }
      await this.init(app);
      await this._loadNetworkData();
   }

   ///
   /// API
   ///

   /**
    * NetworkRelay.get()
    * perform an AJAX GET request through the Relay Server
    * @param {obj} params the request parameters that need to be executed on
    *                     the Core Server
    * @param {obj} jobResponse the callback info for handling the response.
    *              {
    *                  key:'unique.key',
    *                  context:{ obj data }
    *              }
    * @return {Promise}
    */
   get(params, jobResponse) {
      params.type = params.type || "GET";
      return this._createJob(params, jobResponse);
   }

   /**
    * NetworkRelay.post()
    * perform an AJAX POST request through the Relay Server
    * @param {obj} params the request parameters that need to be executed on
    *                     the Core Server
    * @param {obj} jobResponse the callback info for handling the response.
    *              {
    *                  key:'unique.key',
    *                  context:{ obj data }
    *              }
    * @return {Promise}
    */
   post(params, jobResponse) {
      params.type = params.type || "POST";
      return this._createJob(params, jobResponse);
   }

   /**
    * NetworkRelay.put()
    * perform an AJAX PUT request through the Relay Server
    * @param {obj} params the request parameters that need to be executed on
    *                     the Core Server
    * @param {obj} jobResponse the callback info for handling the response.
    *              {
    *                  key:'unique.key',
    *                  context:{ obj data }
    *              }
    * @return {Promise}
    */
   put(params, jobResponse) {
      params.type = params.type || "PUT";
      return this._createJob(params, jobResponse);
   }

   /**
    * NetworkRelay.delete()
    * perform an AJAX DELETE request through the Relay Server
    * @param {obj} params the request parameters that need to be executed on
    *                     the Core Server
    * @param {obj} jobResponse the callback info for handling the response.
    *              {
    *                  key:'unique.key',
    *                  context:{ obj data }
    *              }
    * @return {Promise}
    */
   delete(params, jobResponse) {
      params.type = params.type || "DELETE";
      return this._createJob(params, jobResponse);
   }

   get defaultEventKeys() {
      return {
         callback: "callback",
         offline: "offline",
         online: "online",
      };
   }

   get relayRequestRoute() {
      return this._relayRequestRoute;
   }

   set relayRequestRoute(value) {
      this._relayRequestRoute = value;
   }

   get validRoutes() {
      return {
         config: "/config",
         fileBase64Download: "/file/:uuid/base64?mobile=true",
         fileBase64Upload: "/file/upload/base64/:objID:/:fieldID",
         data: "/app_builder/model/:objID/:id",
      };
   }
}

export default (config.appbuilder.networkType === "relay" &&
   new NetworkRelay()) ||
   new NetworkRest();
