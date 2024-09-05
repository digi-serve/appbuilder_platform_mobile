/**
 * @class Inbox
 */
"use strict";

import Common from "./classes/Common";

const EVENT_KEY_LOAD_INBOX_DATA = "loadInboxData";
const EVENT_KEY_REQUEST_PROCESS_INBOX = "requestProcessInbox";
const EVENT_PATH = "pages.appPage.components.inbox";
const TIME_WAIT_FOR_INBOX_DATA = 1000;

class Inbox extends Common {
   /**
    */
   constructor() {
      super([
         {
            path: "/inbox/",
            componentUrl: "./lib/platform/pages/components/inbox-list.html",
            routes: [
               {
                  path: "formio/:id/",
                  popup: {
                     componentUrl:
                        "./lib/platform/pages/components/inbox-formio.html",
                  },
               },
            ],
         },
      ]);
      this._callbackQueues = [];
      this._inboxData = null;
      this._lock = null;
      this.on(EVENT_KEY_LOAD_INBOX_DATA, (context, res) => {
         const callbackQueues = this._callbackQueues;
         const callbackQueue = callbackQueues.splice(
            callbackQueues.findIndex(
               (callbackQueue) => callbackQueue.id === context.queueUUID,
            ),
            1,
         )[0];

         // This is in case we reload and still receive a job response from MCC.
         const isError = res.status === "error";
         const data = res.data;
         if (callbackQueue == null) {
            (isError && console.error(data)) || this.loadInboxData(true, data);
            return;
         }
         const callback = callbackQueue.callback;
         (isError && callback(data)) || callback(null, data);
      });
      this.on(EVENT_KEY_REQUEST_PROCESS_INBOX, (context, res) => {
         const callbackQueues = this._callbackQueues;
         const callbackQueue = callbackQueues.splice(
            callbackQueues.findIndex(
               (callbackQueue) => callbackQueue.id === context.queueUUID,
            ),
            1,
         )[0];

         // This is in case we reload and still receive a job response from MCC.
         if (callbackQueue == null) {
            (res.status === "error" && console.error(res.data)) ||
               this.requestProcessInbox(null, null, {
                  taskUUID: context.queueUUID,
               });
            return;
         }
         (res.status === "error" && callbackQueue.callback(res.data)) ||
            callbackQueue.callback(null, res.data);
      });
   }

   async init(page) {
      await super.init(page);
      this._lock = new page.app.utils.Lock();
   }

   async loadInboxData(sync = false, backupInboxData) {
      const lock = this._lock;
      const resources = this.page.app.resources;
      const storage = resources.storage;
      if (!sync) {
         try {
            const inboxData = {
               inbox: [],
               inboxMeta: [],
            };
            await lock.acquire();
            await Promise.all([
               (async () => {
                  inboxData.inbox = await storage.getAll("inbox");
               })(),
               (async () => {
                  inboxData.inboxMeta = await storage.getAll("inboxMeta");
               })(),
            ]);
            this._inboxData = inboxData;
            lock.release();
            return;
         } catch (err) {
            lock.release();
            throw err;
         }
      }

      // If this method has already been called, just wait for a response.
      const callbackQueues = this._callbackQueues;
      const callbackQueue = callbackQueues.find(
         (e) => e.id === EVENT_KEY_LOAD_INBOX_DATA,
      );
      if (callbackQueue != null) {
         await new Promise((resolve) => {
            const waitForLoadingInboxData = () => {
               if (callbackQueue == null) {
                  resolve();
                  return;
               }
               setTimeout(() => {
                  waitForLoadingInboxData();
               }, TIME_WAIT_FOR_INBOX_DATA);
            };
            waitForLoadingInboxData();
         });
         return;
      }
      const network = resources.network;
      const inboxData =
         backupInboxData ||
         (await new Promise((resolve, reject) => {
            (async () => {
               callbackQueues.push({
                  id: EVENT_KEY_LOAD_INBOX_DATA,
                  callback: (err, result) => {
                     if (err != null) {
                        reject(new Error(err.message));
                        return;
                     }
                     resolve(result);
                  },
               });
               await network.get(
                  { url: network.validRoutes.inbox },
                  {
                     context: {
                        queueUUID: EVENT_KEY_LOAD_INBOX_DATA,
                        targetEventKey: EVENT_KEY_LOAD_INBOX_DATA,
                        targetEventPath: EVENT_PATH,
                     },
                  },
               );
            })();
         }));
      try {
         await lock.acquire();
         const [storedInbox, storedInboxMeta] = await Promise.all([
            storage.getAll("inbox"),
            storage.getAll("inboxMeta"),
         ]);
         const inbox = inboxData.inbox;
         const inboxMeta = inboxData.inboxMeta;
         await Promise.all(
            inbox
               .map(async (e) => {
                  const key = e.id;
                  const storedItem = storedInbox.find((e2) => e2.id === key);
                  if (storedItem?.status === "processed")
                     e.status = storedItem.status;
                  await storage.set("inbox", key, e);
               })
               .concat(inboxMeta.map((e) => storage.set("inboxMeta", e.id, e)))
               .concat(
                  storedInbox
                     .map(async (e) => {
                        const key = e.id;
                        const inboxIndex = inbox.findIndex(
                           (e2) => e2.id === key,
                        );
                        if (inboxIndex > -1) return;
                        await storage.clear("inbox", key);
                        inbox.splice(inboxIndex, 1);
                     })
                     .concat(
                        storedInboxMeta.map(async (e) => {
                           const key = e.id;
                           const inboxMetaIndex = inboxMeta.findIndex(
                              (e2) => e2.id === key,
                           );
                           if (inboxMetaIndex > -1) return;
                           await storage.clear("inboxMeta", key);
                           inboxMeta.splice(inboxMetaIndex, 1);
                        }),
                     ),
               ),
         );
         this._inboxData = inboxData;
         lock.release();
      } catch (err) {
         lock.release();
         throw err;
      }
   }

   async requestProcessInbox(taskUUID, event, backupData) {
      const page = this.page;
      const app = page.app;
      const resources = app.resources;
      const storage = resources.storage;
      const lock = this._lock;
      const updatingCallbackKeys = ["component.inbox", "component.nav"];
      if (backupData != null) {
         try {
            await lock.acquire();
            await storage.clear("inbox", backupData.taskUUID);
            lock.release();
            return;
         } catch (err) {
            lock.release();
            throw err;
         }
      }
      const network = resources.network;
      return await new Promise((resolve, reject) => {
         (async () => {
            try {
               const inboxData = this._inboxData;
               const inboxItem = inboxData.inbox.find((e) => e.id === taskUUID);
               try {
                  await lock.acquire();
                  inboxItem.status = "processed";
                  await storage.set("inbox", taskUUID, inboxItem);
                  page.updateSyncUI(updatingCallbackKeys);
                  resolve({ taskUUID });
                  lock.release();
               } catch (err) {
                  lock.release();
                  reject(err);
                  return;
               }
               this._callbackQueues.push({
                  id: taskUUID,
                  callback: async (err) => {
                     if (err != null) {
                        console.error(new Error(err.message));
                        inboxItem.status = "pending";
                        await storage.set("inbox", taskUUID, inboxItem);
                        page.updateSyncUI(updatingCallbackKeys);
                        return;
                     }
                     try {
                        await lock.acquire();
                        await storage.clear("inbox", taskUUID);
                        page.updateSyncUI(updatingCallbackKeys);
                        lock.release();
                        return;
                     } catch (err) {
                        lock.release();
                        throw err;
                     }
                  },
               });
               await network.put(
                  {
                     url: network.validRoutes.processInbox.replace(
                        ":taskUUID",
                        taskUUID,
                     ),
                     data: {
                        response: event,
                     },
                  },
                  {
                     context: {
                        queueUUID: taskUUID,
                        targetEventKey: EVENT_KEY_REQUEST_PROCESS_INBOX,
                        targetEventPath: EVENT_PATH,
                     },
                  },
               );
            } catch (err) {
               console.error(err);
            }
         })();
      });
   }

   get inboxData() {
      const { inbox, inboxMeta } = this._inboxData;
      return structuredClone({
         inbox: inbox.filter((e) => e.status !== "processed"),
         inboxMeta,
      });
   }
}

export default new Inbox();
