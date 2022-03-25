/**
 * @class CameraPWA
 *
 * Manages taking photos with the device's camera, and saving them to the
 * app's data directory.
 *
 * You can use getCameraPhoto() or getLibraryPhoto() to obtain an image file.
 *
 * Previously, it was possible to use the permanent `cdvfile` value of that
 * image to display it in the DOM (inside an <img> tag). This is no longer
 * possible. Now only the temporary `url` value can be displayed.
 *
 * Because it is temporary, the `url` cannot be reliably stored for future use.
 * Instead, store the image filename. Then later when you need to display the
 * image, use loadPhotoByName(filename) to obtain a fresh `.url` from the
 * result.
 *
 * Exports a singleton instance.
 */
"use strict";

import async from "async";
import EventEmitter from "eventemitter2";
import Log from "./Log";
import uuid from "uuid/v1";

import { storage } from "./Storage.js";
import fileStorage from "./FileStorage.js";

const defaultHeight = 2000;
const defaultWidth = 2000;

class CameraPWA extends EventEmitter {
   constructor() {
      super();

      // backend HTML elements
      this._$backend = null;
      this._$input = null;
      this._$reset = null;

      this.init();
   }


   /**
    * Internal function to trigger the device camera and deliver the image
    * file.
    *
    * @param {string} type
    *    Either 'camera' or 'library'
    * @return {Promise}
    *    Resolves with a {File}
    */
   _getPicture(type="camera") {
      return new Promise((resolve, reject) => {
         // Get new picture from device camera
         if (type == 'camera') {
            this._$input.attr('capture', 'camera');
         }
         // Get picture from device photo album
         else {
            this._$input.removeAttr('capture');
         }
         
         // Enable
         let isCameraActive = true;
         $('body').append(this._$backend);

         // Event handling
         this._$input.one('change', () => {
            if (isCameraActive) {
               isCameraActive = false;
               let file = this._$input.get(0).files[0];
               // A photo was captured
               if (file) {
                  resolve(file);
               }
               // Sometimes the 'change' event triggers on a cancel
               else {
                  reject(new Error('Canceled'));
               }
            }
         });
         $(window).one('focus', () => {
            // This 'focus' event fires after the camera dialog closes and
            // the original page gets focus again.
            setTimeout(() => {
               // Clear file list
               this._$reset.trigger('click');
               // Clean up DOM
               this._$backend.remove();
               // If cancel happened with no 'change' event we will catch it here
               if (isCameraActive) {
                  isCameraActive = false;
                  reject(new Error('Canceled'));
               }
            }, 300);
         });

         // Activate the device camera
         this._$input.trigger('click');
      });
   }


   init() {
      // Hidden HTML elements used to trigger camera in _getPicture()
      this._$backend = $(`
         <form style="
               display: block;
               position: absolute;
               bottom: 0;
               right: 0;
               visibility: hidden;
         ">
            <input type="file" accept="image/jpeg,image/jpg,image/gif,image/png" capture="camera" />
            <input type="reset" />
         </form>
      `);
      this._$input = this._$backend.find("input[type='file']");
      this._$reset = this._$backend.find("input[type='reset']");
   }

   //////
   //  Camera
   //////

   /**
    * Activate the camera for the user, and obtain the photo taken.
    *
    * @param {int} width
    * @param {int} height
    * @return {Promise}
    *    Resolves with metadata of the saved photo.
    *    {
    *       filename: <string>,
    *       fileEntry: <File|Blob>,
    *       url: <string> // only valid for current session
    *    }
    */
   getCameraPhoto(width = defaultWidth, height = defaultHeight) {
      return new Promise((resolve, reject) => {
         let filename = null;
         let fileEntry = null;
         let url = null;

         this._getPicture('camera')
            .then((file) => {
               filename = file.name + '-' + uuid();
               fileEntry = file;
               url = URL.createObjectURL(file);
               return fileStorage.put(filename, file);
            })
            .then(() => {
               resolve({
                  filename,
                  fileEntry,
                  url
               });
            })
            .catch((err) => {
               if (err.message == "Canceled") {
                  // User canceled the photo. Not a real error.
                  reject(err);
               }
               else {
                  Log("CameraPWA:getCameraPhoto():Error", err);
                  reject(err);
               }
            });
      });
   }

   /**
    * Prompt the user to select an existing photo from their library, and
    * obtain a copy of the chosen photo.
    *
    * @param {int} width
    * @param {int} height
    * @return {Promise}
    *    Resolves with metadata of the copied photo.
    *    {
    *       filename: <string>,
    *       fileEntry: <File|Blob>,
    *       url: <string> // only valid for current session
    *    }
    */
   getLibraryPhoto(width = defaultWidth, height = defaultHeight) {
      return new Promise((resolve, reject) => {
         let filename = null;
         let fileEntry = null;
         let url = null;

         this._getPicture('library')
            .then((file) => {
               filename = file.name + '-' + uuid();
               fileEntry = file;
               url = URL.createObjectURL(file);
               return fileStorage.put(filename, file);
            })
            .then(() => {
               resolve({
                  filename,
                  fileEntry,
                  url
               });
            })
            .catch((err) => {
               if (err.message == "Canceled") {
                  // User canceled the photo. Not a real error.
                  reject(err);
               }
               else {
                  Log("CameraPWA:getCameraPhoto():Error", err);
                  reject(err);
               }
            });
      });
   }

   ////////
   // Photo file management
   ////////

   /**
    * Copies an existing image into the temp directory and delivers the 
    * URL for it.
    *
    * This is no longer necessary under PWA.
    * 
    * @param {string|File} imageFile
    *      Either a string filename, or a FileEntry object for this image
    *      file.
    * @return {Promise}
    *      Resolves with the URL to the temp image.
    */
   tempUrl(imageFile) {
      console.warn("camera.tempURL() is no longer needed.");
      return Promise.resolve()
         .then(() => {
            if (imageFile instanceof FileEntry || imageFile instanceof File) {
               return imageFile;
            }
            else if (typeof imageFile == 'string') {
               return this.loadPhotoByName(imageFile)
                  .then((image) => {
                     return image.fileEntry;
                  })
            }
            else {
               throw new TypeError();
            }
         })
         .then((fileEntry) => {
            let url = URL.createObjectURL(fileEntry);
            return url;
         });
   }


   /**
    * Remove a photo by its filename.
    *
    * @param {string} photoName
    * @return {Promise}
    */
   deletePhoto(photoName) {
      return fileStorage.delete(photoName);
   }


   /**
    *  Remove all locally saved photos
    * @return {Promise}
    */
   deleteLocalImages() {
      return fileStorage.deleteAll();
   }


   /**
    * TODO: find out what this is used for and refactor it for PWA
    */
   imageCleanUp() {
      console.error('imageCleanUp() what does it even do?');
      return Promise.reject(new Error('Deprecated?'));

      return new Promise((resolve, reject) => {
         // make sure _testDirectoryEntry is created before trying to use:
         if (!this.directoryEntry) {
            this.init().then(() => {
               this.imageCleanUp()
                  .then((data) => {
                     resolve(data);
                  })
                  .catch(reject);
            });
            return;
         }

         // Get a directory reader
         var directoryReader = this.directoryEntry.createReader();
         // Get a list of all the entries in the directory
         directoryReader.readEntries(
            (entries) => {
               var currentDate = new Date();
               var currentTime = currentDate.getTime();
               entries.forEach((item, i) => {
                  if (item.isFile && item.name.indexOf("receipt-") > -1) {
                     item.getMetadata(
                        (file) => {
                           var timeDiff = Math.abs(
                              currentTime - file.modificationTime.getTime()
                           );
                           var diff = Math.ceil(timeDiff / (1000 * 3600 * 24));
                           if (diff > 14) {
                              item.remove(
                                 function() {
                                    console.log("File removed");
                                    if (item.name.indexOf("receipt-") > -1) {
                                       storage.set(
                                          "Receipt Image-" +
                                             item.name
                                                .replace("receipt-", "")
                                                .replace(".jpg", ""),
                                          null
                                       );
                                    }
                                 },
                                 function() {
                                    console.log("Error while removing file");
                                 }
                              );
                           }
                        },
                        (error) => {
                           reject(error);
                        }
                     );
                  }
               });
            },
            (error) => {
               reject("Failed during operations: " + error.code);
            }
         );
      });
   }


   /**
    * Calculate the total size of all locally saved images?
    * @return {Promise}
    *    Resolves with {int} total storage in MB
    */
   imageLookUp() {
      return fileStorage.getTotalSize()
         .then((sizeInBytes) => {
            sizeInBytes = sizeInBytes || 0;
            let sizeInMegabytes = Number(sizeInBytes / 1024 / 1024).toFixed(2);
            console.log("Total Storage: " + sizeInMegabytes);
            return sizeInMegabytes;
         });
   }


   /**
    * Loads a previously saved photo by its filename.
    *
    * @param {string} filename
    * @return {Promise}
    *    {
    *       filename: <string>,
    *       fileEntry: <File>,
    *       url: <string> // only valid for current session
    *    }
    */
   loadPhotoByName(filename) {
      return new Promise((resolve, reject) => {
         fileStorage.get(filename)
            .then((imageFile) => {
               let url = URL.createObjectURL(imageFile);
               resolve({
                  filename: filename,
                  fileEntry: imageFile,
                  url: url
               });
            })
            .catch((err) => {
               Log("Unable to find photo file", err);
               reject(err);
            })
      });
   }


   /**
    * Read the given file's data and deliver it as a base64 ascii string.
    *
    * @param {string} name
    *      Filename
    * @return {Promise}
    *      Resolves with {string}
    */
   base64ByName(name) {
      return new Promise((resolve, reject) => {
         fileStorage.get(name)
            .then((file) => {
               // Read the file's data
               var reader = new FileReader();
               reader.onloadend = function() {
                  var binary = this.result;
                  var base64 = window.btoa(binary);
                  resolve(base64);
               };
               reader.readAsBinaryString(file);
            })
            .catch(reject);
      });
   }


   /**
    * Read the given file's data and deliver it as a Blob.
    *
    * @param {string} name
    *      Filename
    * @return {Promise}
    *      Resolves with {Blob|File}
    */
   blobByName(name) {
      return fileStorage.get(name);
   }


   /**
    * DEPRECATED
    * 
    * Assigning an existing photo file a new name within the same directory.
    *
    * @param {string} fromName
    * @param {string} toName
    * @return {Promise}
    */
   rename(fromName, toName) {
      throw new Error("rename() is deprecated");
   }
   

    /**
     * Convert a base64 string in a Blob according to the data and contentType.
     * 
     * @param b64Data {String} Pure base64 string without contentType
     * @param contentType {String} the content type of the file i.e (image/jpeg - image/png - text/plain)
     * @param sliceSize {Int} SliceSize to process the byteCharacters
     * @see http://stackoverflow.com/questions/16245767/creating-a-blob-from-a-base64-string-in-javascript
     * @return Blob
     */
    b64toBlob(b64Data, contentType, sliceSize) {
            contentType = contentType || '';
            sliceSize = sliceSize || 512;

            var byteCharacters = atob(b64Data);
            var byteArrays = [];

            for (var offset = 0; offset < byteCharacters.length; offset += sliceSize) {
                var slice = byteCharacters.slice(offset, offset + sliceSize);

                var byteNumbers = new Array(slice.length);
                for (var i = 0; i < slice.length; i++) {
                    byteNumbers[i] = slice.charCodeAt(i);
                }

                var byteArray = new Uint8Array(byteNumbers);

                byteArrays.push(byteArray);
            }

          var blob = new Blob(byteArrays, {type: contentType});
          return blob;
    }


   /**
    * Save binary data to a file.
    *
    * @param {Blob?} data
    * @param {string} filename
    * @param {string} [mimeType]
    * @return {Promise}
    */
   saveBinaryToName(data, filename, mimeType=null) {
      let file;
      if (!mimeType) {
         file = new File([data], filename);
      }
      else {
         file = new File([data], filename, { type: mimeType });
      }
      let url = URL.createObjectURL(file);

      return fileStorage.put(filename, file)
         .then(() => {
            return {
               filename: filename,
               fileEntry: file,
               url: url
            }
         });
   }

}

export default CameraPWA;
