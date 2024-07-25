/**
 * @class Inbox
 */
"use strict";

import Common from "./classes/Common";

const EVENT_KEY_REQUEST_PROCESS_INBOX = "requestProcessInbox";
const EVENT_PATH = "pages.appPage.components.inbox";

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
      this.app = null;
      this.on(EVENT_KEY_REQUEST_PROCESS_INBOX, (context, res) => {
         const callbackQueues = this._callbackQueues;
         const callbackQueue = callbackQueues.splice(
            callbackQueues.findIndex(
               (callbackQueue) => callbackQueue.id === context.queueUUID
            ),
            1
         )[0];

         // This is in case we reload and still receive a job response from MCC.
         if (callbackQueue == null) {
            (res.status === "error" && console.error(res.data)) ||
               this.requestProcessInbox(null, null, null, {
                  taskUUID: context.queueUUID,
               });
            return;
         }
         (res.status === "error" && callbackQueue.callback(res.data)) ||
            callbackQueue.callback(null, res.data);
      });
   }

   async requestProcessInbox(taskUUID, event, callback, backupTaskUUID) {
      const app = this.page.app;
      if (backupTaskUUID != null) {
         await app.resources.account.loadUserData(true);
         return;
      }
      const network = this.page.app.resources.network;
      await new Promise((resolve, reject) => {
         const queueUUID = app.utils.uuidv4();
         this._callbackQueues.push({
            id: queueUUID,
            callback: (err, result) => {
               if (err != null) {
                  reject(err);
                  return;
               }
               resolve(result);
            },
         });
         (async () => {
            try {
               await network.put(
                  {
                     url: network.validRoutes.processInbox.replace(
                        ":taskUUID",
                        taskUUID
                     ),
                     data: {
                        response: event,
                     },
                  },
                  {
                     context: {
                        queueUUID,
                        targetEventKey: EVENT_KEY_REQUEST_PROCESS_INBOX,
                        targetEventPath: EVENT_PATH,
                        taskUUID,
                     },
                  }
               );
            } catch (err) {
               const callbackQueues = this._callbackQueues;
               callbackQueues.splice(
                  callbackQueues.findIndex(
                     (callbackQueue) => callbackQueue.id === queueUUID
                  ),
                  1
               );
               reject(err);
            }
         })();
      });
      await app.resources.account.loadUserData(true);
      if (callback == null) return { taskUUID };
      const callbackResult = callback({ taskUUID });
      callbackResult instanceof Promise && (await callbackResult);
   }
}

export default new Inbox();
